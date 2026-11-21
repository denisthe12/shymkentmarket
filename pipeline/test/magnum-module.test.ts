import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runStore, type Clock, type HttpClient } from '../src/scrape/core/index.js'
import { MAGNUM_MAX_PAGES, magnumModule } from '../src/scrape/stores/magnum/index.js'
import { MAGNUM_SCOPE } from '../src/scrape/stores/magnum/scope.js'

const BASE = 'https://mgo-gw1.e-magnum.kz'
const TOKEN = 'Bearer test-token'
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/magnum/${name}.json`, import.meta.url), 'utf8'))

type Seen = { url: string; method: string; authorization: string | null }

type Handler = (url: string, headers: Headers) => unknown

function setup(opts: { login?: unknown; storeId?: unknown; pages?: Record<string, unknown>; onProducts?: Handler } = {}) {
  const seen: Seen[] = []
  const logs: string[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    seen.push({ url, method: init?.method ?? 'GET', authorization: headers.get('authorization') })
    if (url.includes('/security/guest/login')) return new Response(JSON.stringify(opts.login ?? { token: TOKEN, refreshToken: 'r' }))
    if (url.includes('/type/all/attributes')) return new Response(JSON.stringify({ darkStore: { id: opts.storeId === undefined ? 7001 : opts.storeId } }))
    if (url.includes('/catalog/client/platformItemV2')) {
      if (opts.onProducts) return new Response(JSON.stringify(opts.onProducts(url, headers)))
      const q = new URL(url).searchParams
      const key = `${q.get('categoryIds')}:${q.get('pageId')}`
      const body = opts.pages?.[key]
      if (body === undefined) throw new Error(`unexpected page ${key}`)
      return new Response(JSON.stringify(body))
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch
  const clock: Clock = { now: () => 0, sleep: async () => {} }
  const run = () =>
    runStore(magnumModule, { env: {}, fetchImpl, clock, random: () => 0, now: () => new Date('2026-11-20T10:00:00.000Z'), log: (m: string) => { logs.push(m) } })
  return { seen, logs, run }
}

const withNumber = (body: unknown, number: number) => ({ ...(body as object), number })
const FIRST = MAGNUM_SCOPE[0]!.id
const productRequests = (seen: Seen[]) => seen.filter(s => s.url.includes('platformItemV2'))
const param = (url: string, name: string) => new URL(url).searchParams.get(name)

describe('magnumModule', () => {
  it('declares identity and limits', () => {
    expect(magnumModule.storeCode).toBe('MAGNUM')
    expect(magnumModule.city).toBe('Shymkent')
    expect(magnumModule.limits).toEqual({ concurrency: 4, rps: 8, maxConcurrency: 8, maxRps: 20 })
  })

  it('seeds page 0 per scope leaf in table order', () => {
    const seeds = magnumModule.seeds({ authorization: TOKEN })
    expect(seeds).toEqual(MAGNUM_SCOPE.map(c => ({ category: c.id, page: 0 })))
  })

  it('describes the task by category id, leaf name and page', () => {
    const text = magnumModule.describe({ category: FIRST, page: 2 })
    expect(text).toBe(`Magnum category ${FIRST} (${MAGNUM_SCOPE[0]!.path[2]}) page 2`)
  })

  it('logs in as a guest, checks the store, and sends the token and query on product requests', async () => {
    const pages = Object.fromEntries(MAGNUM_SCOPE.map(c => [`${c.id}:0`, withNumber(fixture('last-page'), 0)]))
    const { seen, run } = setup({ pages })
    await run()

    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.url).toBe(`${BASE}/auth/server/api/v1/security/guest/login`)
    const check = new URL(seen[1]!.url)
    expect(check.pathname).toBe('/productstore/geo/api/v1/type/all/attributes')
    expect(check.searchParams.get('latitude')).toBe('42.368009')
    expect(check.searchParams.get('longitude')).toBe('69.612769')

    const reqs = productRequests(seen)
    expect(reqs).toHaveLength(MAGNUM_SCOPE.length)
    for (const r of reqs) expect(r.authorization).toBe(TOKEN)
    expect(param(reqs[0]!.url, 'platformId')).toBe('7001')
    expect(param(reqs[0]!.url, 'categoryIds')).toBe(FIRST)
    expect(param(reqs[0]!.url, 'pageId')).toBe('0')
  })

  it('rejects the run when the login response has no token', async () => {
    const { run } = setup({ login: { refreshToken: 'r' } })
    await expect(run()).rejects.toThrow(/token/i)
  })

  it('rejects the run when the dark store is not 7001', async () => {
    const { run } = setup({ storeId: 1234 })
    await expect(run()).rejects.toThrow(/7001.*1234/)
  })

  it('rejects the run when the dark store is missing', async () => {
    const { run } = setup({ storeId: null })
    await expect(run()).rejects.toThrow(/7001/)
  })

  it('never leaks the token into a thrown message', async () => {
    const { run } = setup({ pages: {} })
    const err = await run().then(() => null, (e: unknown) => e)
    expect(String(err)).not.toContain('test-token')
  })

  it('handle queues the next page for a full page and none for last/empty pages', async () => {
    const bodies: unknown[] = [fixture('full-page'), withNumber(fixture('last-page'), 0), withNumber(fixture('empty-page'), 0)]
    const http = { json: async () => bodies.shift() } as unknown as HttpClient
    const ctx = { authorization: TOKEN }
    const task = { category: FIRST, page: 0 }

    const full = await magnumModule.handle(task, ctx, http)
    expect(full.next).toEqual([{ category: FIRST, page: 1 }])
    expect('total' in full).toBe(false)
    expect(full.products?.length).toBeGreaterThan(0)

    const last = await magnumModule.handle(task, ctx, http)
    expect(last.next ?? []).toEqual([])

    const empty = await magnumModule.handle(task, ctx, http)
    expect(empty.next ?? []).toEqual([])
    expect('total' in empty).toBe(false)
  })

  it('follows pagination through runStore', async () => {
    const pages: Record<string, unknown> = Object.fromEntries(MAGNUM_SCOPE.map(c => [`${c.id}:0`, withNumber(fixture('empty-page'), 0)]))
    pages[`${FIRST}:0`] = fixture('full-page')
    pages[`${FIRST}:1`] = fixture('last-page')
    const { seen, run } = setup({ pages })
    await run()
    const asked = productRequests(seen)
      .filter(r => param(r.url, 'categoryIds') === FIRST)
      .map(r => param(r.url, 'pageId'))
    expect(asked.sort()).toEqual(['0', '1'])
  })

  it('rejects a response whose page number differs from the requested one', async () => {
    const http = { json: async () => fixture('last-page') } as unknown as HttpClient
    await expect(magnumModule.handle({ category: FIRST, page: 0 }, { authorization: TOKEN }, http)).rejects.toThrow(new RegExp(FIRST))
  })

  it('stops with an error when a leaf never ends', async () => {
    const onProducts: Handler = url => {
      const q = new URL(url).searchParams
      const pageId = Number(q.get('pageId'))
      const content = q.get('categoryIds') === FIRST
        ? [{ itemId: 100 + pageId, name: 'Товар', price: 10000, measureUnit: { name: 'шт', isDividable: false, divideValue: 1 }, availabilityId: 3, isActive: true }]
        : []
      return { content, number: pageId, size: 1 }
    }
    const { seen, logs, run } = setup({ onProducts })
    const file = await run()
    expect(file.errorCount).toBeGreaterThan(0)
    expect(logs.join('|')).toContain(String(MAGNUM_MAX_PAGES))
    const firstCalls = productRequests(seen).filter(r => param(r.url, 'categoryIds') === FIRST)
    expect(firstCalls).toHaveLength(MAGNUM_MAX_PAGES)
    expect(productRequests(seen).length).toBeLessThanOrEqual(MAGNUM_MAX_PAGES + MAGNUM_SCOPE.length)
  })

  it('does not put the token into the log or the task description', async () => {
    let thrown = false
    const onProducts: Handler = (url, headers) => {
      if (!thrown) {
        thrown = true
        throw new Error(`boom ${headers.get('authorization')}`)
      }
      return withNumber(fixture('empty-page'), Number(param(url, 'pageId')))
    }
    const { logs, run } = setup({ onProducts })
    await run()
    expect(logs.join('|')).not.toContain('test-token')
    expect(magnumModule.describe({ category: FIRST, page: 0 })).not.toContain('Bearer')
  })
})
