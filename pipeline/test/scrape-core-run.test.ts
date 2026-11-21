import { describe, expect, it } from 'vitest'
import { assertNoErrors, runStore, type RunOptions, type StoreModule, type StoreTask, type TaskResult } from '../src/scrape/core/index.js'
import type { Clock } from '../src/scrape/core/index.js'
import type { SourceFile } from '../src/types.js'

type Task = StoreTask & { page: number }

type Reply = TaskResult<Task> & { delayMs?: number }

/** Replies per category, consumed in order (one per fetch of that category). */
type Script = Record<string, Reply[]>

const BASE = 'https://example.test/api/cat/'

function product(id: string, over: Record<string, unknown> = {}) {
  return {
    sourceProductId: id,
    name: `Product ${id}`,
    price: 100,
    oldPrice: null,
    imageUrl: null,
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: [],
    rawPayload: {},
    ...over,
  }
}

// A clock that never really waits and advances 5 ms per reading.
function stepClock(): Clock {
  let t = 0
  return { now: () => (t += 5), sleep: async () => {} }
}

function fakeFetch(script: Script): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    const category = url.slice(BASE.length)
    if (category === 'boom') return new Response('nope', { status: 404 })
    const reply = script[category]?.shift()
    if (!reply) throw new Error(`unexpected fetch ${url}`)
    if (reply.delayMs) await new Promise(r => setTimeout(r, reply.delayMs))
    return new Response(JSON.stringify(reply))
  }) as typeof fetch
}

function fakeModule(categories: string[], over: Partial<StoreModule<Task>> = {}): StoreModule<Task> {
  return {
    storeCode: 'MAGNUM',
    city: 'Testville',
    limits: { concurrency: 4, rps: 100, maxConcurrency: 8, maxRps: 200 },
    seeds: () => categories.map(category => ({ category, page: 1 })),
    async handle(task, _ctx, http) {
      const r = await http.json<Reply>(BASE + task.category)
      const products = r.products?.map(p => {
        const rec = p as Record<string, unknown>
        return Array.isArray(rec.sourceCategoryPath) && rec.sourceCategoryPath.length === 0
          ? { ...rec, sourceCategoryPath: [task.category] }
          : rec
      })
      return { products, total: r.total, seen: r.seen }
    },
    describe: task => `category ${task.category} page ${task.page}`,
    ...over,
  }
}

async function run(module: StoreModule<Task>, script: Script, opts: RunOptions = {}) {
  const logs: string[] = []
  const file: SourceFile = await runStore(module, {
    env: {},
    fetchImpl: fakeFetch(script),
    clock: stepClock(),
    random: () => 0,
    now: () => new Date('2026-11-20T10:00:00.000Z'),
    log: msg => logs.push(msg),
    ...opts,
  })
  return { file, logs }
}

describe('runStore', () => {
  it('builds a SourceFile with store, city and products', async () => {
    const { file } = await run(fakeModule(['a']), { a: [{ products: [product('p1'), product('p2')] }] })
    expect(file.storeCode).toBe('MAGNUM')
    expect(file.city).toBe('Testville')
    expect(file.capturedAt).toBe('2026-11-20T10:00:00.000Z')
    expect(file.errorCount).toBe(0)
    expect(file.products.map(p => p.sourceProductId).sort()).toEqual(['p1', 'p2'])
  })

  it('deduplicates by sourceProductId, path from the earliest seed category', async () => {
    const { file } = await run(fakeModule(['a', 'b']), {
      a: [{ products: [product('p1')], delayMs: 30 }],
      b: [{ products: [product('p1'), product('p2')] }],
    })
    expect(file.errorCount).toBe(0)
    expect(file.products).toHaveLength(2)
    expect(file.products.find(p => p.sourceProductId === 'p1')?.sourceCategoryPath).toEqual(['a'])
  })

  it('counts an invalid product as an error and keeps the rest', async () => {
    const { file, logs } = await run(fakeModule(['a']), {
      a: [{ products: [product('p1'), product('bad', { price: -1 }), product('p3')] }],
    })
    expect(file.errorCount).toBe(1)
    expect(file.products.map(p => p.sourceProductId).sort()).toEqual(['p1', 'p3'])
    expect(logs.some(l => l.includes('bad'))).toBe(true)
  })

  it('counts a failed task as an error with its description', async () => {
    const { file, logs } = await run(fakeModule(['a', 'boom']), { a: [{ products: [product('p1')] }] })
    expect(file.errorCount).toBe(1)
    expect(file.products).toHaveLength(1)
    expect(logs.some(l => l.includes('category boom page 1') && l.includes('HTTP 404'))).toBe(true)
  })

  it('stops after the first failed task: later seeds are not handled', async () => {
    const handled: string[] = []
    const base = fakeModule(['boom', 'a', 'b', 'c'])
    const module = fakeModule(['boom', 'a', 'b', 'c'], {
      async handle(task, ctx, http) {
        handled.push(task.category)
        return base.handle(task, ctx, http)
      },
    })
    const { file, logs } = await run(module, {}, { env: { MAGNUM_CONCURRENCY: '1' } })
    expect(handled).toEqual(['boom'])
    expect(file.errorCount).toBeGreaterThanOrEqual(1)
    expect(file.sourceStats.aborted).toBe(true)
    expect(file.sourceStats.skipped).toBe(3)
    expect(file.sourceStats.tasks).toBe(1)
    expect(file.sourceStats.recounted).toBe(0)
    expect(logs).toContain('run stopped after a failed task: 3 task(s) skipped')
  })

  it('lets in-flight tasks finish after a failed task', async () => {
    const { file } = await run(fakeModule(['boom', 'a', 'b', 'c']), {
      a: [{ products: [product('p1')], delayMs: 20 }],
    }, { env: { MAGNUM_CONCURRENCY: '2' } })
    expect(file.sourceStats.aborted).toBe(true)
    expect(file.sourceStats.skipped).toBe(2)
    expect(file.products.map(p => p.sourceProductId)).toEqual(['p1'])
  })

  it('does not stop on an invalid product and skips the recount', async () => {
    const { file } = await run(fakeModule(['a', 'b']), {
      a: [{ products: [product('bad', { price: -1 })], total: 5, seen: 1 }],
      b: [{ products: [product('p2')] }],
    })
    expect(file.sourceStats.aborted).toBe(false)
    expect(file.sourceStats.skipped).toBe(0)
    expect(file.sourceStats.tasks).toBe(2)
    expect(file.sourceStats.recounted).toBe(0)
    expect(file.errorCount).toBe(2) // invalid product + category a mismatch
    expect(file.products.map(p => p.sourceProductId)).toEqual(['p2'])
  })

  it('accepts an empty category', async () => {
    const { file } = await run(fakeModule(['a']), { a: [{ products: [], total: 0, seen: 0 }] })
    expect(file.errorCount).toBe(0)
    expect(file.products).toEqual([])
    expect(file.sourceStats.recounted).toBe(0)
  })

  it('re-runs a category once when seen differs from total', async () => {
    const { file } = await run(fakeModule(['a']), {
      a: [
        { products: [product('p1')], total: 10, seen: 9 },
        { products: [product('p1'), product('p2')], total: 10, seen: 10 },
      ],
    })
    expect(file.errorCount).toBe(0)
    expect(file.sourceStats.recounted).toBe(1)
    expect(file.sourceStats['cat.a.seen']).toBe(10)
    expect(file.products).toHaveLength(2)
  })

  it('fails a category whose recount still differs', async () => {
    const { file, logs } = await run(fakeModule(['a']), {
      a: [
        { products: [product('p1')], total: 10, seen: 9 },
        { products: [product('p1')], total: 10, seen: 9 },
      ],
    })
    expect(file.errorCount).toBe(1)
    expect(file.sourceStats.recounted).toBe(1)
    expect(logs).toContain('category a: seen 9 of total 10')
  })

  it('uses limits from env', async () => {
    const { file } = await run(fakeModule(['a']), { a: [{ products: [] }] }, { env: { MAGNUM_CONCURRENCY: '2' } })
    expect(file.sourceStats.concurrency).toBe(2)
    expect(file.sourceStats.rps).toBe(100)
  })

  it('writes flat sourceStats', async () => {
    const { file } = await run(fakeModule(['a', 'b']), {
      a: [{ products: [product('p1')], total: 1, seen: 1 }],
      b: [{ products: [product('p2')] }],
    })
    const s = file.sourceStats
    for (const key of ['durationMs', 'requests', 'retries', 'status429', 'status5xx', 'timeouts', 'networkErrors', 'bytes', 'tasks', 'concurrency', 'rps', 'categories', 'recounted']) {
      expect(typeof s[key], key).toBe('number')
    }
    expect(s.scoped).toBe(true)
    expect(s.aborted).toBe(false)
    expect(s.skipped).toBe(0)
    expect(s.engine).toBe('scrape-core-1')
    expect(s.requests).toBe(2)
    expect(s.tasks).toBe(2)
    expect(s.categories).toBe(2)
    expect(s['cat.a.seen']).toBe(1)
    expect(s['cat.a.total']).toBe(1)
    expect('cat.b.total' in s).toBe(false)
    for (const v of Object.values(s)) expect(['number', 'string', 'boolean']).toContain(typeof v)
  })

  it('follows next tasks returned by the handler', async () => {
    const module = fakeModule(['a'], {
      async handle(task, _ctx, http) {
        const r = await http.json<Reply>(BASE + task.category)
        return { products: r.products, seen: r.seen, total: r.total, next: task.page === 1 ? [{ category: 'a', page: 2 }] : undefined }
      },
    })
    const { file } = await run(module, {
      a: [
        { products: [product('p1', { sourceCategoryPath: ['a'] })], seen: 1, total: 2 },
        { products: [product('p2', { sourceCategoryPath: ['a'] })], seen: 1, total: 2 },
      ],
    })
    expect(file.errorCount).toBe(0)
    expect(file.sourceStats.tasks).toBe(2)
    expect(file.sourceStats['cat.a.seen']).toBe(2)
    expect(file.products).toHaveLength(2)
  })

  it('passes the prepared context to seeds and handle', async () => {
    const module: StoreModule<Task, { prefix: string }> = {
      ...fakeModule([]),
      prepare: async () => ({ prefix: 'x' }),
      seeds: ctx => [{ category: `${ctx.prefix}a`, page: 1 }],
      async handle(task, ctx, http) {
        const r = await http.json<Reply>(BASE + task.category)
        return { products: r.products?.map(p => ({ ...(p as object), name: `${ctx.prefix} item` })) }
      },
    }
    const logs: string[] = []
    const file = await runStore(module, {
      env: {}, fetchImpl: fakeFetch({ xa: [{ products: [product('p1')] }] }), clock: stepClock(), log: m => logs.push(m),
    })
    expect(file.products[0]?.name).toBe('x item')
  })

  it('rejects when prepare fails', async () => {
    const module: StoreModule<Task, number> = {
      ...fakeModule(['a']),
      prepare: async () => { throw new Error('no token') },
      seeds: () => [{ category: 'a', page: 1 }],
      handle: async () => ({}),
    }
    await expect(runStore(module, { env: {}, fetchImpl: fakeFetch({}), clock: stepClock(), log: () => {} })).rejects.toThrow('no token')
  })
})

describe('assertNoErrors', () => {
  const file = (errorCount: number): SourceFile => ({
    storeCode: 'MAGNUM', city: 'Testville', capturedAt: '2026-11-20T10:00:00.000Z', errorCount, sourceStats: {}, products: [],
  })

  it('assertNoErrors throws on errors and passes on zero', () => {
    expect(() => assertNoErrors(file(0))).not.toThrow()
    expect(() => assertNoErrors(file(3))).toThrow(/MAGNUM.*3.*keeping previous file/)
  })
})
