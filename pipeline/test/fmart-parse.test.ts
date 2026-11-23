import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SourceProductSchema } from '../src/types.js'
import {
  FMART_FRESH_UNIT_GRAMS,
  fmartFreshId,
  parseFmartPage,
  type FmartLeaf,
  type FmartSection,
} from '../src/scrape/stores/fmart/parse.js'

const TODAY = '2026-11-23'
const leaf = (id: string): FmartLeaf => ({ id, slug: 'groats', path: ['Бакалея', 'Крупы', 'Крупы фасованные'] })
const section = (over: Partial<FmartSection> = {}): FmartSection => ({
  id: 'sec-1',
  fresh: false,
  leaves: new Map([['11', leaf('11')]]),
  excluded: new Set(['12']),
  ...over,
})
const freshSection = () => section({ id: 'fresh-1', fresh: true })

function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1, name: 'Товар', name_ru: null, sku: null, external_id: 'ext-1', price: 100, in_stock: true, sellable: true,
    category_id: 11, category_name: 'ЛИСТ', on_sale: false, sale_price: null, date_on_sale_from: null, date_on_sale_to: null,
    sell_by: 'piece', uom: 'шт', vendor_id: null, image_url: null, ...over,
  }
}
const weighted = (over: Record<string, unknown> = {}) => item({ sell_by: 'weight', uom: 'кг', unit_g: 100, price: 256, price_per_kg: 2299, ...over })
const fresh = (over: Record<string, unknown> = {}) =>
  item({ id: 5, name: 'Картошка', external_id: null, vendor_id: 1, uom: 'кг', price: 158, ...over })
const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  items, total: items.length, page: 1, per_page: 100, total_pages: 1, ...over,
})
const run = (items: unknown[], sec = section(), over: Record<string, unknown> = {}) =>
  parseFmartPage(page(items, over), sec, { page: 1, perPage: 100 }, TODAY)
const one = (it: Record<string, unknown>, sec = section()) => run([it], sec).rows[0]!
const prod = (it: Record<string, unknown>, sec = section()) => {
  const row = one(it, sec)
  expect(row.skip).toBeNull()
  return row.product!
}

describe('parseFmartPage explicit weighted goods', () => {
  it('takes the per-kg price, with an undated promo', () => {
    const p = prod(weighted({ on_sale: true, sale_price: 229 }))
    expect(p.price).toBe(2299)
    expect(p.oldPrice).toBeNull()
    expect(p.rawPayload).toMatchObject({ isWeighted: true, priceUnit: 'kg', weightSource: 'flag', unitGrams: 100, unitPrice: 256, regularPrice: 2560, promoPrice: 2299 })
    const kilo = prod(weighted({ unit_g: 1000, price: 430, on_sale: true, sale_price: 362, price_per_kg: 362 }))
    expect(kilo.price).toBe(362)
  })
  it('keeps the old price for an active dated promo', () => {
    const p = prod(weighted({ on_sale: true, sale_price: 229, date_on_sale_from: '2026-11-01', date_on_sale_to: '2026-11-30' }))
    expect(p.price).toBe(2299)
    expect(p.oldPrice).toBe(2560)
  })
  it('uses the regular price after the promo ended', () => {
    const p = prod(weighted({ on_sale: true, sale_price: 229, date_on_sale_to: '2026-11-10', price_per_kg: 2560 }))
    expect(p.price).toBe(2560)
    expect(p.oldPrice).toBeNull()
    expect(p.rawPayload).toMatchObject({ promoPrice: null })
  })
  it('rejects a per-kg price that matches neither unit price', () => {
    expect(() => run([weighted({ id: 77, price: 100, price_per_kg: 2299 })])).toThrow(/product 77/)
    expect(() => run([weighted({ id: 77, price: 100, price_per_kg: 2299 })])).toThrow(/sec-1/)
  })
  it('rejects a zero per-kg price', () => {
    expect(() => run([weighted({ price: 0, price_per_kg: 0 })])).toThrow()
    expect(() => run([weighted({ price_per_kg: 0, price: 0.1 })])).toThrow()
    expect(() => run([weighted({ price: 256, price_per_kg: 0 })])).toThrow(/price_per_kg/)
  })
})

describe('parseFmartPage fresh produce', () => {
  it('doubles the half-kilo price', () => {
    const p = prod(fresh(), freshSection())
    expect(p.sourceProductId).toBe('fmart_fresh_картошка')
    expect(p.price).toBe(316)
    expect(p.rawPayload).toMatchObject({ isWeighted: true, priceUnit: 'kg', weightSource: 'fresh500', unitGrams: FMART_FRESH_UNIT_GRAMS, unitPrice: 158, code: null })
  })
  it('doubles promo and old prices too', () => {
    const p = prod(fresh({ on_sale: true, sale_price: 100, date_on_sale_from: '2026-11-23' }), freshSection())
    expect(p.price).toBe(200)
    expect(p.oldPrice).toBe(316)
  })
  it('honours an explicit weight flag', () => {
    const p = prod(fresh({ sell_by: 'weight', unit_g: 1000, price: 316, price_per_kg: 316 }), freshSection())
    expect(p.rawPayload).toMatchObject({ weightSource: 'flag', unitGrams: 1000 })
    expect(p.price).toBe(316)
  })
  it('skips fresh pieces', () => {
    expect(one(fresh({ uom: 'шт', price: 1200 }), freshSection()).skip).toBe('freshPiece')
  })
  it('skips other piece-per-kg goods and counts them', () => {
    expect(one(item({ uom: 'кг' })).skip).toBe('unitKg')
    expect(one(item({ uom: 'кг', vendor_id: 1 })).skip).toBe('unitKg')
    expect(one(item({ uom: 'кг', external_id: 'x' }), freshSection()).skip).toBe('unitKg')
  })
  it('treats piece goods of other units as ordinary', () => {
    expect(prod(item({ uom: null })).rawPayload).toMatchObject({ isWeighted: false })
  })
  it('names ids from the fresh rule only for the fresh vendor or a missing code', () => {
    expect(prod(fresh({ name: '  Ёжевика  Свежая ', external_id: 'abc' }), freshSection()).sourceProductId).toBe('fmart_fresh_ежевика-свежая')
    expect(prod(item({ external_id: 'abc', uom: 'шт' }), freshSection()).sourceProductId).toBe('fmart_abc')
    expect(prod(item({ external_id: null, name: 'Лук' }), freshSection()).sourceProductId).toBe('fmart_fresh_лук')
    expect(fmartFreshId('Ёлка Зелёная')).toBe('fmart_fresh_елка-зеленая')
  })
  it('rejects an unknown way of selling', () => {
    expect(() => run([item({ id: 8, sell_by: 'box' })])).toThrow(/product 8/)
    expect(() => run([item({ sell_by: null })])).toThrow()
  })
})

describe('parseFmartPage ordinary goods', () => {
  it('applies a dated active promo', () => {
    const p = prod(item({ price: 1015, on_sale: true, sale_price: 825, date_on_sale_from: '2026-11-23', date_on_sale_to: '2026-11-23' }))
    expect(p.price).toBe(825)
    expect(p.oldPrice).toBe(1015)
    expect(p.rawPayload).toMatchObject({ isWeighted: false, priceUnit: null, weightSource: null, unitGrams: null, regularPrice: 1015, promoPrice: 825, unitPrice: 1015 })
  })
  it('applies an undated promo without an old price', () => {
    const p = prod(item({ price: 120, on_sale: true, sale_price: 85 }))
    expect(p.price).toBe(85)
    expect(p.oldPrice).toBeNull()
  })
  it('ignores a promo that has not started', () => {
    const p = prod(item({ price: 120, on_sale: true, sale_price: 85, date_on_sale_from: '2026-11-24' }))
    expect(p.price).toBe(120)
    expect(p.oldPrice).toBeNull()
    expect(p.rawPayload).toMatchObject({ promoPrice: null })
  })
  it('ignores a promo that is not cheaper, off, or zero', () => {
    expect(prod(item({ price: 100, on_sale: true, sale_price: 100 })).price).toBe(100)
    expect(prod(item({ price: 100, on_sale: true, sale_price: 130 })).price).toBe(100)
    expect(prod(item({ price: 100, on_sale: false, sale_price: 50 })).price).toBe(100)
    expect(prod(item({ price: 100, on_sale: true, sale_price: 0 })).price).toBe(100)
  })
  it('converts timestamps to the Almaty date', () => {
    const live = prod(item({ price: 120, on_sale: true, sale_price: 85, date_on_sale_from: '2026-11-22T19:30:00Z' }))
    expect(live.price).toBe(85)
    const notYet = prod(item({ price: 120, on_sale: true, sale_price: 85, date_on_sale_from: '2026-11-23T19:30:00Z' }))
    expect(notYet.price).toBe(120)
  })
  it('rejects an unparseable date', () => {
    expect(() => run([item({ on_sale: true, sale_price: 5, date_on_sale_to: 'soon' })])).toThrow()
  })
  it('skips unavailable goods but still reports them', () => {
    const r = run([item({ id: 1, in_stock: false }), item({ id: 2, sellable: false, price: 0 }), item({ id: 3 })])
    expect(r.rows.map((x) => x.skip)).toEqual(['unavailable', 'unavailable', null])
    expect(r.rows.map((x) => x.itemId)).toEqual(['1', '2', '3'])
  })
  it('rejects a non-positive price and rounds fractions', () => {
    expect(() => run([item({ id: 4, price: 0 })])).toThrow(/product 4/)
    expect(() => run([item({ price: -3 })])).toThrow()
    expect(prod(item({ price: 51.4 })).price).toBe(51)
  })
  it('prefers the Russian name', () => {
    expect(prod(item({ name: 'Общее', name_ru: 'Русское' })).name).toBe('Русское')
    expect(prod(item({ name: 'Общее', name_ru: '  ' })).name).toBe('Общее')
  })
  it('keeps only 13-digit codes as barcodes', () => {
    expect(prod(item({ sku: '123456789012' })).rawPayload).toMatchObject({ barcode: null })
    expect(prod(item({ sku: '2900000000011' })).rawPayload).toMatchObject({ barcode: '2900000000011', code: 'ext-1', itemId: '1' })
  })
  it('requires a code outside the fresh section', () => {
    expect(() => run([item({ id: 6, external_id: null })])).toThrow(/product 6/)
  })
  it('records path, leaf and section', () => {
    const p = prod(item())
    expect(p.sourceCategoryPath).toEqual(['Бакалея', 'Крупы', 'Крупы фасованные'])
    expect(p.rawPayload).toMatchObject({ leafId: '11', categoryId: '11', sectionId: 'sec-1' })
    expect(p.sourceUrl).toBeNull()
    expect(p.brand).toBeNull()
  })
})

describe('parseFmartPage leaves, order and page shape', () => {
  it('skips excluded and unknown leaves before anything else', () => {
    const r = run([
      item({ id: 1, category_id: 12, in_stock: false, sell_by: 'box' }),
      item({ id: 2, category_id: 99, category_name: 'ЧУЖОЙ', sell_by: 'box' }),
      item({ id: 3, in_stock: false, sell_by: 'box' }),
    ])
    expect(r.rows.map((x) => x.skip)).toEqual(['excludedLeaf', 'unknownLeaf', 'unavailable'])
    expect(r.rows[1]!.unknownLeaf).toBe('ЧУЖОЙ')
    expect(r.rows[1]!.product).toBeNull()
  })
  it('keeps the regular price as the sort key', () => {
    const r = run([item({ price: 120, on_sale: true, sale_price: 85 }), item({ id: 2, in_stock: false, price: 7 })])
    expect(r.rows.map((x) => x.sortPrice)).toEqual([120, 7])
  })
  it('rejects pages that are not the ones asked for', () => {
    expect(() => run([], section(), { page: 2 })).toThrow(/sec-1/)
    expect(() => run([], section(), { per_page: 50 })).toThrow(/sec-1/)
    expect(() => run([], section(), { total: undefined })).toThrow(/sec-1/)
    expect(() => parseFmartPage([], section(), { page: 1, perPage: 100 }, TODAY)).toThrow(/sec-1/)
    expect(() => parseFmartPage({ items: 'x' }, section(), { page: 1, perPage: 100 }, TODAY)).toThrow(/sec-1/)
    expect(() => run([item({ id: 1 }), item({ id: 1 })])).toThrow(/sec-1/)
    expect(() => run([null])).toThrow(/sec-1/)
  })
  it('accepts an empty section', () => {
    const r = run([], section(), { total: 0, total_pages: 0 })
    expect(r).toEqual({ rows: [], total: 0, totalPages: 0 })
  })
  it('maps a recorded-shape page', () => {
    const body = JSON.parse(readFileSync(new URL('./fixtures/fmart/page.json', import.meta.url), 'utf8'))
    const r = parseFmartPage(body, section(), { page: 1, perPage: 100 }, TODAY)
    expect(r.total).toBe(3)
    expect(r.rows.map((x) => x.skip)).toEqual([null, null, 'unavailable'])
    for (const row of r.rows) if (row.product) expect(() => SourceProductSchema.parse(row.product)).not.toThrow()
    expect(r.rows[0]!.product).toMatchObject({ price: 535, oldPrice: 655, name: 'Тестовая крупа 400г' })
    expect(r.rows[1]!.product).toMatchObject({ price: 8790, name: 'Тестовый сыр весовой' })
  })
})
