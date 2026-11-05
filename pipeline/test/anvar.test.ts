import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANVAR_SCOPE, assertAnvarShop, mapAnvarItem, scrapeAnvar, type AnvarItem } from '../src/scrapers/anvar.js'
import type { SourceProduct } from '../src/types.js'

const fx = JSON.parse(readFileSync(new URL('./fixtures/anvar-products.json', import.meta.url), 'utf8'))
const offer = (o: object): AnvarItem => ({
  id: '1', name: 'Овощи Капуста цветная вес', price_type: 'weight',
  priceOffers: [{ price: 1999, oldPrice: 0, quant: 'KGM', quantAmount: 1, isDefault: true, ...o }],
  categories: [{ id: '8971', name: 'Фрукты, овощи, грибы' }],
})

describe('mapAnvarItem', () => {
  it('maps every fixture item with anvar_ ids and positive integer prices', () => {
    const mapped = fx.products.map(mapAnvarItem)
    expect(mapped.length).toBeGreaterThanOrEqual(3)
    expect(mapped.every((p: SourceProduct | null) => p && p.sourceProductId.startsWith('anvar_') && Number.isInteger(p.price) && p.price > 0)).toBe(true)
    expect(fx.products.some((p: AnvarItem) => p.priceOffers?.[0]?.quant === 'KGM')).toBe(true)
    expect(fx.products.some((p: AnvarItem) => p.priceOffers?.[0]?.quant === 'PCE')).toBe(true)
  })
  it('uses the KGM offer price, never the rounded top-level price', () => {
    expect(mapAnvarItem({ ...offer({}), price: 2 } as AnvarItem)!.price).toBe(1999)
    expect(mapAnvarItem({ ...offer({}), name: 'Сыр Российский 300 г вес' })!.price).toBe(600) // 1999 * 300 / 1000 → 600
    expect(mapAnvarItem(offer({}))!.rawPayload.priceUnit).toBe('kg')
  })
  it('keeps oldPrice only when it is above price, and drops items without a usable offer', () => {
    expect(mapAnvarItem(offer({ price: 1499, oldPrice: 1999 }))!.oldPrice).toBe(1999)
    expect(mapAnvarItem(offer({ oldPrice: 0 }))!.oldPrice).toBeNull()
    expect(mapAnvarItem({ ...offer({}), priceOffers: [] })).toBeNull()
    expect(mapAnvarItem(offer({ price: 0 }))).toBeNull()
    expect(mapAnvarItem(offer({ quant: 'PCE', quantAmount: 6 }))).toBeNull()
  })
  it('prefers the default offer and takes the barcode from an imported preview url', () => {
    const p = mapAnvarItem({
      ...offer({}),
      priceOffers: [{ price: 10, quant: 'PCE', isDefault: false }, { price: 699, oldPrice: 0, quant: 'PCE', quantAmount: 1, isDefault: true }],
      preview: { url: 'https://backend.shop.anvar.kz/public/product/preview/imported/4870204140194-1-1782374025477/4870204140194-1-1782374025477_300x300.jpg' },
    })!
    expect(p.price).toBe(699)
    expect(p.rawPayload.barcode).toBe('4870204140194')
    expect(p.sourceUrl).toBeNull()
    expect(p.brand).toBeNull()
  })
})

describe('assertAnvarShop', () => {
  it('assertAnvarShop checks the shop by id only', () => {
    expect(() => assertAnvarShop(fx.shops, '7')).not.toThrow()
    expect(() => assertAnvarShop(fx.shops, '999')).toThrow(/not found/)
  })
})

describe('scrapeAnvar', () => {
  const item = (n: number): AnvarItem => ({ ...offer({}), id: String(1000 + n), name: `Молоко тест ${n} 1 л`, price_type: 'piece', priceOffers: [{ price: 500 + n, oldPrice: 0, quant: 'PCE', quantAmount: 1, isDefault: true }] })
  const page1 = Array.from({ length: 24 }, (_, i) => item(i))
  const page2 = [item(24)]

  const mock = (opts: { withMilk?: boolean } = {}) => {
    const calls: { headers: Record<string, string>; query: string; variables: Record<string, unknown> }[] = []
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      calls.push({ headers: init.headers as Record<string, string>, query: body.query, variables: body.variables ?? {} })
      const reply = (data: unknown) => new Response(JSON.stringify({ data }))
      if (/shops\s*\{/.test(body.query)) return reply({ shops: fx.shops })
      if (/categories\s*\(/.test(body.query)) {
        const parent = body.variables?.parentId
        if (parent === undefined || parent === null) return reply({ categories: [{ id: '8975', name: 'Молочные продукты', parent_id: null }, { id: '8981', name: 'Бытовая химия', parent_id: null }] })
        if (String(parent) === '8975') return reply({ categories: opts.withMilk === false ? [{ id: '9198', name: 'Сгущенное молоко', parent_id: 8975 }] : [{ id: '9192', name: 'Молоко', parent_id: 8975 }] })
        return reply({ categories: [] })
      }
      if (/products\s*\(/.test(body.query)) {
        const page = Number(body.variables.page)
        return reply({ products: { pageInfo: { total: 25, lastPage: 2 }, edges: page === 1 ? page1 : page === 2 ? page2 : [] } })
      }
      throw new Error(`unexpected query ${body.query}`)
    }) as unknown as typeof fetch
    return { fetchImpl, calls }
  }
  const scope = [{ id: '9192', name: 'Молоко' }]

  it('scrapes only the scope categories and their children, with accept-language ru', async () => {
    const { fetchImpl, calls } = mock()
    const file = await scrapeAnvar({ fetchImpl, delayMs: 0, scope })
    expect(calls.every((c) => c.headers['accept-language'] === 'ru')).toBe(true)
    const productCalls = calls.filter((c) => /products\s*\(/.test(c.query))
    expect(productCalls.length).toBeGreaterThan(0)
    expect(productCalls.every((c) => String(c.variables.categoryId) === '9192')).toBe(true)
    expect(productCalls.some((c) => String(c.variables.categoryId) === '8981')).toBe(false)
    expect(file.products).toHaveLength(25)
    expect(file.storeCode).toBe('ANVAR')
    expect(file.city).toBe('Aktau')
    expect(file.sourceStats).toMatchObject({ shopId: '7', scoped: true, total: 25 })
    expect(file.sourceStats).not.toHaveProperty('shopCity')
    expect(calls.some((c) => /city/.test(c.query))).toBe(false)
  })
  it('fails when a scope category disappears from the tree', async () => {
    const { fetchImpl } = mock({ withMilk: false })
    await expect(scrapeAnvar({ fetchImpl, delayMs: 0, scope })).rejects.toThrow(/scope category 9192 Молоко not found/)
  })
  it('defines the 19 scope categories from the plan', () => {
    expect(ANVAR_SCOPE).toHaveLength(19)
    expect(ANVAR_SCOPE[0]).toEqual({ id: '8971', name: 'Фрукты, овощи, грибы' })
  })
})
