import { describe, expect, it } from 'vitest'
import { runStore, type Clock, type HttpClient } from '../src/scrape/core/index.js'
import { createFmartModule } from '../src/scrape/stores/fmart/index.js'
import type { FmartPage, FmartRow } from '../src/scrape/stores/fmart/parse.js'
import { FMART_SECTIONS } from '../src/scrape/stores/fmart/scope.js'
import { walkFmartSection } from '../src/scrape/stores/fmart/walk.js'

const ENV = { FMART_REQUEST_HEADERS: JSON.stringify({ 'x-test-a': 'one', 'x-test-b': 'two' }) }
const FIRST = FMART_SECTIONS[0]!
const SECOND = FMART_SECTIONS[1]!
const FRESH = FMART_SECTIONS.find(s => s.fresh)!
const leafOf = (s: (typeof FMART_SECTIONS)[number]) => [...s.leaves.keys()][0]!

type Item = Record<string, unknown>
const item = (id: number, over: Item = {}): Item => ({
  id, name: `Товар ${id}`, external_id: `ext-${id}`, price: id, in_stock: true, sellable: true, category_id: leafOf(FIRST),
  category_name: 'ЛИСТ', on_sale: false, sale_price: null, sell_by: 'piece', uom: 'шт', vendor_id: null, ...over,
})
const many = (n: number, over: (id: number) => Item = () => ({})) => Array.from({ length: n }, (_, i) => item(i + 1, over(i + 1)))
/** Positions 99 and 100 (0-based) share a price, so the first page boundary cuts the pair. */
const tied = (n: number, extra: (id: number) => Item = () => ({})) => many(n, id => ({ price: id === 101 ? 100 : id, ...extra(id) }))
/** What a full-size page walk sees: the second item of the cut pair is lost, the first one comes twice. */
const lossy = (list: Item[]) => list.map((x, i) => (i === 100 ? list[99]! : x))

/** Items of a section as listed for the given page size. */
type Listing = (perPage: number) => Item[]
type Body = { items: Item[]; total: number; page: number; per_page: number; total_pages: number }
const bodyOf = (list: Item[], page: number, perPage: number): Body => ({
  items: list.slice((page - 1) * perPage, page * perPage),
  total: list.length, page, per_page: perPage, total_pages: Math.ceil(list.length / perPage),
})

type Seen = { url: URL; headers: Headers }
function setup(listings: Record<string, Listing> = {}, tweak: (b: Body, section: string) => unknown = b => b) {
  const seen: Seen[] = []
  const logs: string[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    seen.push({ url, headers: new Headers(init?.headers) })
    const q = url.searchParams
    const section = q.get('category_id') as string
    const perPage = Number(q.get('per_page'))
    return new Response(JSON.stringify(tweak(bodyOf(listings[section]?.(perPage) ?? [], Number(q.get('page')), perPage), section)))
  }) as typeof fetch
  const clock: Clock = { now: () => 0, sleep: async () => {} }
  const fmart = createFmartModule(ENV, () => new Date('2026-11-23T10:00:00.000Z'))
  const run = () => runStore(fmart.module, { env: {}, fetchImpl, clock, random: () => 0, log: m => { logs.push(m) } })
  const of = (id: string) =>
    seen.filter(s => s.url.searchParams.get('category_id') === id)
      .map(s => `${s.url.searchParams.get('page')}/${s.url.searchParams.get('per_page')}`)
  return { seen, logs, run, of, ...fmart }
}

describe('createFmartModule', () => {
  it('declares identity, limits and headers', () => {
    const { module } = createFmartModule(ENV)
    expect(module.storeCode).toBe('FMART')
    expect(module.city).toBe('Shymkent')
    expect(module.limits).toEqual({ concurrency: 2, rps: 4, maxConcurrency: 4, maxRps: 8 })
    expect(module.headers).toEqual({ accept: 'application/json', 'x-test-a': 'one', 'x-test-b': 'two' })
    expect(module.seeds(undefined)).toEqual(FMART_SECTIONS.map(s => ({ category: s.id })))
    expect(module.describe({ category: FIRST.id })).toBe(`F-Mart section ${FIRST.id} (${[...FIRST.leaves.values()][0]!.path[1]})`)
  })

  it.each([undefined, ' ', '["a"]', '{"x-test-a": 1}'])('refuses to start with headers %j, before any fetch', value => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return new Response('{}') }) as typeof fetch
    expect(() => runStore(createFmartModule({ FMART_REQUEST_HEADERS: value }).module, { fetchImpl })).toThrow(/FMART_REQUEST_HEADERS/)
    expect(calls).toBe(0)
  })

  it('asks for every section once, by ascending price, with the configured headers', async () => {
    const { seen, run } = setup()
    const file = await run()
    expect(file.errorCount).toBe(0)
    expect(file.products).toEqual([])
    expect(seen.map(s => s.url.searchParams.get('category_id')).sort()).toEqual(FMART_SECTIONS.map(s => s.id).sort())
    for (const { url, headers } of seen) {
      const { store_id, category_id: _c, ...rest } = Object.fromEntries(url.searchParams)
      expect(store_id).toMatch(/^\d+$/)
      expect(rest).toEqual({ page: '1', per_page: '100', sort_by: 'price', sort_order: 'asc' })
      expect(headers.get('accept')).toBe('application/json')
      expect(headers.get('x-test-a')).toBe('one')
      expect(headers.get('x-test-b')).toBe('two')
    }
  })

  it('walks all pages of a section and stops at the last one', async () => {
    const { seen, run, of } = setup({ [FIRST.id]: () => many(250) })
    const file = await run()
    expect(file.errorCount).toBe(0)
    expect(file.products).toHaveLength(250)
    expect(of(FIRST.id)).toEqual(['1/100', '2/100', '3/100'])
    for (const { headers } of seen) expect(headers.get('x-test-a')).toBe('one')
    expect(file.sourceStats[`cat.${FIRST.id}.seen`]).toBe(250)
    expect(file.sourceStats[`cat.${FIRST.id}.total`]).toBe(250)
  })

  it('closes a repeat on the page boundary with one window, without doubling skips', async () => {
    const list = tied(150, id => ({ in_stock: id !== 100 }))
    const { run, of, runStats } = setup({ [FIRST.id]: per => (per === 100 ? lossy(list) : list) })
    const file = await run()
    expect(file.errorCount).toBe(0)
    expect(of(FIRST.id)).toEqual(['1/100', '2/100', '2/99'])
    expect(file.products).toHaveLength(149)
    expect(file.sourceStats[`cat.${FIRST.id}.seen`]).toBe(150)
    expect(runStats().skippedUnavailable).toBe(1)
  })

  it('refuses a section whose repeat the window does not close', async () => {
    const { run, logs } = setup({ [FIRST.id]: () => lossy(tied(150)) })
    expect((await run()).errorCount).toBeGreaterThan(0)
    expect(logs.join('\n')).toMatch(/repeated on one page/)
  })

  it('refuses two products with one id in a section, also in the fresh one', async () => {
    const plain = setup({ [FIRST.id]: () => [item(1, { external_id: 'same' }), item(2, { external_id: 'same' })] })
    expect((await plain.run()).errorCount).toBeGreaterThan(0)
    expect(plain.logs.join('\n')).toMatch(/fmart_same/)
    const veg = (id: number) => item(id, { name: 'Лук', external_id: null, vendor_id: 1, uom: 'кг', category_id: leafOf(FRESH) })
    const fresh = setup({ [FRESH.id]: () => [veg(1), veg(2)] })
    expect((await fresh.run()).errorCount).toBeGreaterThan(0)
    expect(fresh.logs.join('\n')).toMatch(/fmart_fresh_лук/)
  })

  it('keeps a product listed in two sections once, in the first section', async () => {
    const { run } = setup({
      [FIRST.id]: () => [item(1)],
      [SECOND.id]: () => [item(1, { category_id: leafOf(SECOND) })],
    })
    const file = await run()
    expect(file.errorCount).toBe(0)
    expect(file.products).toHaveLength(1)
    expect(file.products[0]!.rawPayload.sectionId).toBe(FIRST.id)
  })

  it('counts weights, skips and unknown leaves; a repeated section does not double them', async () => {
    const leaf = leafOf(FRESH)
    const list = [
      item(1, { sell_by: 'weight', unit_g: 1000, price_per_kg: 1, category_id: leaf }),
      item(2, { name: 'Лук', vendor_id: 1, uom: 'кг', category_id: leaf }),
      item(3, { vendor_id: 1, uom: 'шт', category_id: leaf }),
      item(4, { uom: 'кг', category_id: leaf }),
      item(5, { in_stock: false, category_id: leaf }),
      item(6, { category_id: 900001, category_name: 'НОВЫЙ' }),
      item(7, { category_id: 900001, category_name: 'НОВЫЙ' }),
      item(8, { category_id: 900002, category_name: 'ДРУГОЙ' }),
    ]
    const excluded = item(1, { category_id: [...FIRST.excluded][0]! })
    const { module, runStats } = createFmartModule(ENV)
    const http = {
      json: async (url: string) => bodyOf(new URL(url).searchParams.get('category_id') === FRESH.id ? list : [excluded], 1, 100),
    } as unknown as HttpClient
    const expected = {
      weightedFlag: 1, weightedFresh: 1, skippedUnavailable: 1, skippedUnitKg: 1, skippedFreshPiece: 1,
      skippedExcludedLeaf: 1, unknownLeafProducts: 3, unknownLeaves: 'ДРУГОЙ,НОВЫЙ',
    }
    for (let i = 0; i < 2; i++) {
      const r = await module.handle({ category: FRESH.id }, undefined, http)
      expect(r).toMatchObject({ seen: 8, total: 8 })
      expect(r.products).toHaveLength(2)
      await module.handle({ category: FIRST.id }, undefined, http)
      expect(runStats()).toEqual(expected)
    }
  })

  it('takes "today" in Almaty', async () => {
    // 20:00 UTC on the 22nd is already the 23rd in Almaty
    const { module } = createFmartModule(ENV, () => new Date('2026-11-22T20:00:00.000Z'))
    const sale = item(1, { price: 100, on_sale: true, sale_price: 80, date_on_sale_from: '2026-11-23', date_on_sale_to: '2026-11-23' })
    const http = { json: async () => bodyOf([sale], 1, 100) } as unknown as HttpClient
    const r = await module.handle({ category: FIRST.id }, undefined, http)
    expect(r.products).toMatchObject([{ price: 80, oldPrice: 100 }])
  })

  it('rejects an unknown task category', async () => {
    const http = { json: async () => bodyOf([], 1, 100) } as unknown as HttpClient
    await expect(createFmartModule(ENV).module.handle({ category: '1' }, undefined, http)).rejects.toThrow(/FMART_SECTIONS/)
  })

  it.each<[string, RegExp, (b: Body) => unknown]>([
    ['a changed total', /total/, b => (b.page === 2 ? { ...b, total: 251 } : b)],
    ['a short page', /99 rows/, b => (b.page === 2 ? { ...b, items: b.items.slice(1) } : b)],
    ['a falling price', /price falls/, b => (b.page === 2 ? { ...b, items: [{ ...b.items[0], price: 50 }, ...b.items.slice(1)] } : b)],
    ['an inconsistent page count', /pages/, b => ({ ...b, total_pages: 2 })],
  ])('counts %s as an error', async (_n, why, tweak) => {
    const { run, logs } = setup({ [FIRST.id]: () => many(250) }, (b, s) => (s === FIRST.id ? tweak(b) : b))
    expect((await run()).errorCount).toBeGreaterThan(0)
    expect(logs.join('\n')).toMatch(why)
  })
})

describe('walkFmartSection', () => {
  const row = (id: string, sortLow: number, sortHigh = sortLow): FmartRow => ({ itemId: id, sortLow, sortHigh, product: null, skip: 'unavailable', unknownLeaf: null })
  type Key = number | readonly [low: number, high: number]
  const rows = (keys: Key[]) => keys.map((k, i) => (typeof k === 'number' ? row(`i${i}`, k) : row(`i${i}`, k[0], k[1])))
  /** Price per unit of a weighted item as an interval per kg. */
  const kg = (price: number, unit: number): Key => [(price * 1000) / unit - (1000 / unit + 1), (price * 1000) / unit + 1000 / unit + 1]
  function server(list: FmartRow[], full = list, tweak: (p: FmartPage, perPage: number) => FmartPage = p => p) {
    const calls: string[] = []
    const walk = () => walkFmartSection(async (page, perPage) => {
      calls.push(`${page}/${perPage}`)
      const src = perPage === 100 ? full : list
      return tweak({ rows: src.slice((page - 1) * perPage, page * perPage), total: list.length, totalPages: Math.ceil(list.length / perPage) }, perPage)
    })
    return { calls, walk }
  }
  const seq = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i)
  const same = (n: number, price: number) => Array<number>(n).fill(price)

  it.each([0, 1])('accepts an empty section reported as %i page(s)', async totalPages => {
    const { calls, walk } = server([], [], p => ({ ...p, totalPages }))
    expect(await walk()).toEqual({ rows: [], total: 0 })
    expect(calls).toEqual(['1/100'])
  })

  it('needs no window when no group is cut', async () => {
    const { calls, walk } = server(rows([...seq(98), 500, 500, ...seq(50, 600)]))
    expect((await walk()).rows).toHaveLength(150)
    expect(calls).toEqual(['1/100', '2/100'])
  })

  it('takes the largest page size that covers the group', async () => {
    // positions 90..149: sizes 75 to 90 cover it
    const { calls, walk } = server(rows([...seq(90), ...same(60, 100), ...seq(60, 200)]))
    expect((await walk()).rows).toHaveLength(210)
    expect(calls).toEqual(['1/100', '2/100', '3/100', '2/90'])
  })

  it('refuses a group no window covers or one longer than a page', async () => {
    await expect(server(rows([...seq(60), ...same(71, 100), ...seq(60, 200)])).walk()).rejects.toThrow(/no window/)
    await expect(server(rows([...seq(50), ...same(101, 100), ...seq(20, 200)])).walk()).rejects.toThrow(/no window/)
  })

  it('asks for one window per group', async () => {
    const { calls, walk } = server(rows([...seq(95), ...same(10, 1000), ...seq(90, 2000), ...same(10, 3000), ...seq(20, 4000)]))
    expect((await walk()).rows).toHaveLength(225)
    expect(calls).toEqual(['1/100', '2/100', '3/100', '2/95', '3/97'])
  })

  it('accepts a last window shorter than its page size', async () => {
    const { calls, walk } = server(rows([...seq(99), 100, 100]))
    expect((await walk()).rows).toHaveLength(101)
    expect(calls).toEqual(['1/100', '2/100', '2/99'])
  })

  it('checks the window: total, size, page count and prices', async () => {
    const list = rows([...seq(99), 100, 100, ...seq(49, 200)])
    const broken = (tweak: (p: FmartPage) => FmartPage) => server(list, list, (p, per) => (per === 100 ? p : tweak(p))).walk()
    await expect(broken(p => p)).resolves.toMatchObject({ total: 150 })
    await expect(broken(p => ({ ...p, total: 151 }))).rejects.toThrow(/total/)
    await expect(broken(p => ({ ...p, rows: p.rows.slice(1) }))).rejects.toThrow(/rows/)
    await expect(broken(p => ({ ...p, totalPages: 9 }))).rejects.toThrow(/pages/)
    await expect(broken(p => ({ ...p, rows: p.rows.map((r, i) => (i === 5 ? { ...r, sortLow: 1, sortHigh: 1 } : r)) }))).rejects.toThrow(/price/)
  })

  it('keeps the first occurrence and refuses one item at two prices', async () => {
    const list = rows([...seq(99), 100, 100, ...seq(49, 200)])
    const first = list[99]!
    const full = list.map((r, i) => (i === 100 ? { ...first } : r))
    const got = await server(list, full).walk()
    expect(got.rows.filter(r => r.itemId === first.itemId)).toHaveLength(1)
    expect(got.rows.find(r => r.itemId === first.itemId)).toBe(first)
    // the pages and the window disagree about the members of the cut group
    const swapped = list.map((r, i) => (i === 100 ? { ...r, itemId: 'other' } : r))
    await expect(server(swapped, list).walk()).rejects.toThrow(/151 distinct products of total 150/)
    const moved = list.map((r, i) => (i === 120 ? { ...r, itemId: 'i3' } : r))
    await expect(server(moved).walk()).rejects.toThrow(/i3.*two prices/)
  })

  it('orders weighted rows by the price per kg', async () => {
    const { calls, walk } = server(rows([...seq(99), 1790, kg(475, 250), kg(482, 250), 1995, kg(210, 100), kg(2500, 1000), kg(150, 50), ...seq(20, 4000)]))
    expect((await walk()).rows).toHaveLength(126)
    expect(calls).toEqual(['1/100', '2/100'])
  })

  it('fetches a window for overlapping weighted intervals on the boundary', async () => {
    const list = rows([...seq(99), kg(475, 250), kg(476, 250), ...seq(20, 3000)])
    const { calls, walk } = server(list, list.map((r, i) => (i === 100 ? list[99]! : r)))
    expect((await walk()).rows).toHaveLength(121)
    expect(calls).toEqual(['1/100', '2/100', '2/99'])
  })

  it('never splits overlapping intervals that are not adjacent', async () => {
    // the wide interval at 98 overlaps the piece at 100; the pieces at 99 and 100 differ
    const { calls, walk } = server(rows([...seq(98), kg(95, 50), 1900, 1910, ...seq(20, 3000)]))
    await walk()
    expect(calls).toEqual(['1/100', '2/100', '2/98'])
  })

  it('checks window rows by overlapping intervals', async () => {
    const list = rows([...seq(99), kg(475, 250), kg(476, 250), ...seq(20, 3000)])
    const swap = (rs: FmartRow[]) => [rs[1]!, rs[0]!, ...rs.slice(2)]
    await expect(server(list, list, (p, per) => (per === 100 ? p : { ...p, rows: swap(p.rows) })).walk()).resolves.toMatchObject({ total: 121 })
  })

  it('refuses a falling price on many pages, also after a weighted row; any order is fine on one page', async () => {
    await expect(server(rows([...seq(99), 1790, 1700, ...seq(20, 3000)])).walk()).rejects.toThrow(/price falls/)
    await expect(server(rows([...seq(99), kg(475, 250), 1890, ...seq(20, 3000)])).walk()).rejects.toThrow(/price falls/)
    const one = server(rows([9, 3, kg(475, 250), 1]))
    expect((await one.walk()).rows).toHaveLength(4)
    expect(one.calls).toEqual(['1/100'])
  })

  it('refuses more than 100 pages before reading on', async () => {
    const { calls, walk } = server(rows(seq(10_001)))
    await expect(walk()).rejects.toThrow(/101 pages/)
    expect(calls).toEqual(['1/100'])
    const lying = server(rows(seq(150)), undefined, p => ({ ...p, totalPages: 1 }))
    await expect(lying.walk()).rejects.toThrow(/pages/)
  })
})
