import { describe, expect, it } from 'vitest'
import { runStore, type Clock, type HttpClient } from '../src/scrape/core/index.js'
import { GRAMAD_SECTION_CAP, createGramadModule } from '../src/scrape/stores/gramad/index.js'
import { GRAMAD_SCOPE } from '../src/scrape/stores/gramad/scope.js'
import { summarizeGramad } from '../src/scrape/stores/gramad/stats.js'
import type { SourceFile, SourceProduct } from '../src/types.js'

const HEADERS = JSON.stringify({ 'x-test-a': 'one', 'x-test-b': 'two' })
const ENV = { GRAMAD_REQUEST_HEADERS: HEADERS }
const FIRST = GRAMAD_SCOPE[0]!.id
const SECOND = GRAMAD_SCOPE[1]!.id

type Tile = { code: string; name?: string; price?: number }
const section = (tiles: Tile[]) => ({
  type: 'GRID_VIEW_LAYOUT',
  data: {
    title: 'Тест',
    body: tiles.length === 0 ? [] : [{
      id: 'x-s.1', type: 'GRID',
      data: {
        title: 'Тест', columns: 2,
        elements: tiles.map(t => ({
          type: 'PRODUCT_TILE',
          data: { id: 1, storeProductId: t.code, name: t.name ?? `Товар ${t.code} 1Л`, price: t.price ?? 100, imageUrl: null, promotions: [], outOfStock: false },
          actions: [],
        })),
      },
    }],
  },
})

type Seen = { url: string; headers: Headers }
function setup(bodies: Record<string, unknown> = {}, fail: Set<string> = new Set()) {
  const seen: Seen[] = []
  const logs: string[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    seen.push({ url, headers: new Headers(init?.headers) })
    const id = new URL(url).searchParams.get('id') as string
    if (fail.has(id)) return new Response('boom', { status: 400 })
    return new Response(JSON.stringify(bodies[id] ?? section([])))
  }) as typeof fetch
  const clock: Clock = { now: () => 0, sleep: async () => {} }
  const run = () =>
    runStore(createGramadModule(ENV), { env: {}, fetchImpl, clock, random: () => 0, now: () => new Date('2026-11-22T10:00:00.000Z'), log: (m: string) => { logs.push(m) } })
  return { seen, logs, run }
}

describe('createGramadModule', () => {
  it('declares identity and limits', () => {
    const m = createGramadModule(ENV)
    expect(m.storeCode).toBe('GRAMAD')
    expect(m.city).toBe('Shymkent')
    expect(m.limits).toEqual({ concurrency: 2, rps: 4, maxConcurrency: 4, maxRps: 8 })
  })

  it('seeds one task per scope leaf in table order', () => {
    expect(createGramadModule(ENV).seeds(undefined)).toEqual(GRAMAD_SCOPE.map(c => ({ category: c.id })))
  })

  it('describes the task by section id and leaf name', () => {
    expect(createGramadModule(ENV).describe({ category: FIRST })).toBe(`Gramad section ${FIRST} (${GRAMAD_SCOPE[0]!.path[2]})`)
  })

  it.each([
    ['missing', undefined],
    ['blank', '  '],
    ['not JSON', 'x-a=1'],
    ['an array', '["a"]'],
    ['null', 'null'],
    ['non-string values', '{"x-test-a": 1}'],
  ])('refuses to start when the headers variable is %s', (_n, value) => {
    expect(() => createGramadModule({ GRAMAD_REQUEST_HEADERS: value })).toThrow(/GRAMAD_REQUEST_HEADERS/)
  })

  it('does not call fetch when the variable is missing', () => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return new Response('{}') }) as typeof fetch
    expect(() => runStore(createGramadModule({}), { fetchImpl })).toThrow(/GRAMAD_REQUEST_HEADERS/)
    expect(calls).toBe(0)
  })

  it('merges the configured headers after the default accept', () => {
    expect(createGramadModule(ENV).headers).toEqual({ accept: 'application/json', 'x-test-a': 'one', 'x-test-b': 'two' })
  })

  it('requests every scope leaf exactly once, with the configured headers', async () => {
    const { seen, run } = setup()
    const file = await run()
    const ids = seen.map(s => new URL(s.url).searchParams.get('id'))
    expect(ids.sort()).toEqual(GRAMAD_SCOPE.map(c => c.id).sort())
    for (const s of seen) {
      const u = new URL(s.url)
      expect(u.searchParams.get('component')).toBe('section')
      expect(u.pathname).toMatch(/^\/v4\/stores\/\d+\/addresses\/\d+\/content\/partial$/)
      expect(s.headers.get('x-test-a')).toBe('one')
      expect(s.headers.get('x-test-b')).toBe('two')
      expect(s.headers.get('accept')).toBe('application/json')
    }
    expect(file.errorCount).toBe(0)
  })

  it('puts every product of a leaf into the file', async () => {
    const { run } = setup({ [FIRST]: section([{ code: '4870000000001' }, { code: '4870000000002' }, { code: '4870000000003' }]) })
    const file = await run()
    expect(file.products).toHaveLength(3)
    expect(file.sourceStats[`cat.${FIRST}.seen`]).toBe(3)
  })

  it('keeps a product found in two leaves once, in the first leaf', async () => {
    const { run } = setup({
      [FIRST]: section([{ code: '4870000000001' }]),
      [SECOND]: section([{ code: '4870000000001' }, { code: '4870000000002' }]),
    })
    const file = await run()
    expect(file.products).toHaveLength(2)
    const dup = file.products.find(p => p.sourceProductId.endsWith('4870000000001'))!
    expect((dup.rawPayload as { categoryId: string }).categoryId).toBe(FIRST)
  })

  it('counts a failed request as an error', async () => {
    const { run } = setup({}, new Set([SECOND]))
    const file = await run()
    expect(file.errorCount).toBeGreaterThan(0)
  })

  it('rejects an unknown task category', async () => {
    const http = { json: async () => section([]) } as unknown as HttpClient
    await expect(createGramadModule(ENV).handle({ category: '1' }, undefined, http)).rejects.toThrow(/GRAMAD_SCOPE/)
  })

  it('handle returns products and seen without follow-ups or a total', async () => {
    const http = { json: async () => section([{ code: '4870000000001' }]) } as unknown as HttpClient
    const r = await createGramadModule(ENV).handle({ category: FIRST }, undefined, http)
    expect(r.products).toHaveLength(1)
    expect(r.seen).toBe(1)
    expect('next' in r).toBe(false)
    expect('total' in r).toBe(false)
  })
})

const prod = (id: string, raw: Record<string, unknown>): SourceProduct => ({
  sourceProductId: id, name: 'Товар', price: 1, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null, sourceCategoryPath: [], rawPayload: raw,
})
const file = (products: SourceProduct[], sourceStats: SourceFile['sourceStats']): SourceFile => ({
  storeCode: 'GRAMAD', city: 'Shymkent', capturedAt: '2026-11-22T00:00:00.000Z', errorCount: 0, sourceStats, products,
})

describe('summarizeGramad', () => {
  it('counts weighted and ambiguous products', () => {
    const f = file([
      prod('a', { isWeighted: true, weightAmbiguous: false }),
      prod('b', { isWeighted: true, weightAmbiguous: false }),
      prod('c', { isWeighted: false, weightAmbiguous: true }),
      prod('d', { isWeighted: false, weightAmbiguous: false }),
      prod('e', {}),
    ], {})
    expect(summarizeGramad(f)).toMatchObject({ weighted: 2, weightAmbiguous: 1 })
  })

  it('lists sections that reached the cap', () => {
    const f = file([], {
      'cat.111.seen': GRAMAD_SECTION_CAP,
      'cat.222.seen': GRAMAD_SECTION_CAP - 1,
      'cat.333.seen': GRAMAD_SECTION_CAP + 5,
      tasks: 300,
    })
    expect(summarizeGramad(f).cappedSections).toEqual(['111', '333'])
  })

  it('reports no capped sections when none reached the cap', () => {
    expect(summarizeGramad(file([], { 'cat.1.seen': 5 })).cappedSections).toEqual([])
  })
})
