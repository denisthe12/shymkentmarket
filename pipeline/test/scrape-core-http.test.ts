import { describe, expect, it } from 'vitest'
import { createHttpClient, HttpError, type HttpClientOptions } from '../src/scrape/core/http.js'
import { Limiter, type Clock } from '../src/scrape/core/limiter.js'

// Event-driven virtual clock (same idea as the limiter test): sleepers wake in
// time order and time jumps to the earliest timer once microtasks settle.
function virtualClock(): Clock {
  let t = 0
  const timers: { at: number; seq: number; resolve: () => void }[] = []
  let seq = 0
  let pumping = false
  const pump = () => {
    if (pumping) return
    pumping = true
    setTimeout(() => {
      pumping = false
      timers.sort((a, b) => a.at - b.at || a.seq - b.seq)
      const next = timers.shift()
      if (next) { t = Math.max(t, next.at); next.resolve() }
      if (timers.length) pump()
    }, 0)
  }
  return {
    now: () => t,
    sleep: ms => new Promise<void>(resolve => {
      timers.push({ at: t + ms, seq: seq++, resolve })
      pump()
    }),
  }
}

type Step = Response | Error | (() => Response)

const URL_ = 'https://example.test/api/items'

function setup(steps: Step[], opts: Partial<HttpClientOptions> = {}) {
  const base = virtualClock()
  const pauses: number[] = []
  const clock: Clock = { now: base.now, sleep: ms => { pauses.push(ms); return base.sleep(ms) } }
  // The limiter gets the unwrapped clock so only the client's pauses are recorded.
  const limiter = new Limiter({ concurrency: 10, rps: 1e6, clock: base })
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    const step = steps.shift()
    if (step === undefined) throw new Error('unexpected fetch')
    if (step instanceof Error) throw step
    return typeof step === 'function' ? step() : step
  }) as typeof fetch
  const client = createHttpClient({ limiter, clock, fetchImpl, random: () => 0.5, ...opts })
  return { client, pauses, calls, clock: base }
}

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init)
const status = (code: number, headers?: Record<string, string>) => new Response('err', { status: code, headers })

describe('createHttpClient', () => {
  it('returns parsed json and counts one request and bytes', async () => {
    const { client } = setup([new Response('{"name":"ёж"}')])
    await expect(client.json(URL_)).resolves.toEqual({ name: 'ёж' })
    expect(client.stats()).toEqual({
      requests: 1, retries: 0, status429: 0, status5xx: 0, timeouts: 0, networkErrors: 0,
      bytes: Buffer.byteLength('{"name":"ёж"}', 'utf8'),
    })
    expect(client.stats().bytes).toBe(15)
  })

  it('retries 500 then succeeds', async () => {
    const { client } = setup([status(500), json({ ok: true })])
    await expect(client.json(URL_)).resolves.toEqual({ ok: true })
    expect(client.stats()).toMatchObject({ requests: 2, retries: 1, status5xx: 1 })
  })

  it('honours Retry-After seconds on 429', async () => {
    const { client, pauses } = setup([status(429, { 'Retry-After': '2' }), json(1)])
    await expect(client.json(URL_)).resolves.toBe(1)
    expect(pauses).toEqual([2000])
    expect(client.stats()).toMatchObject({ status429: 1, retries: 1 })
  })

  it('honours Retry-After http-date on 503', async () => {
    const { client, pauses, clock } = setup([
      () => status(503, { 'Retry-After': new Date(clock.now() + 3000).toUTCString() }),
      json(1),
    ])
    await expect(client.json(URL_)).resolves.toBe(1)
    expect(pauses).toEqual([3000])
    expect(client.stats()).toMatchObject({ status5xx: 1 })
  })

  it('caps Retry-After at maxDelayMs', async () => {
    const { client, pauses } = setup([status(429, { 'Retry-After': '3600' }), json(1)], { maxDelayMs: 30_000 })
    await client.json(URL_)
    expect(pauses).toEqual([30_000])
  })

  // 429 without a usable Retry-After: baseDelayMs + random * (cap - baseDelayMs) = 500 + 0.5 * (1000 - 500).
  it.each(['soon 5', '-5', '1.5'])('falls back to backoff on unusable Retry-After %j', async value => {
    const { client, pauses } = setup([status(429, { 'Retry-After': value }), json(1)])
    await client.json(URL_)
    expect(pauses).toEqual([750])
  })

  it('waits at least baseDelayMs on 429 without Retry-After', async () => {
    const { client, pauses } = setup([status(429), json(1)], { random: () => 0 })
    await client.json(URL_)
    expect(pauses).toEqual([500])
  })

  it('a 429 with Retry-After pauses other requests too', async () => {
    const clock = virtualClock()
    // rps 1: the second request is reserved for t=1000, inside the 2 s pause.
    const limiter = new Limiter({ concurrency: 10, rps: 1, clock })
    const starts: Record<string, number[]> = { a: [], b: [] }
    const fetchImpl = (async (input: string | URL | Request) => {
      const key = String(input).endsWith('/a') ? 'a' : 'b'
      starts[key]!.push(clock.now())
      return key === 'a' && starts.a!.length === 1 ? status(429, { 'Retry-After': '2' }) : json(key)
    }) as typeof fetch
    const client = createHttpClient({ limiter, clock, fetchImpl, random: () => 0.5 })
    const [a, b] = await Promise.all([client.json(`${URL_}/a`), client.json(`${URL_}/b`)])
    expect([a, b]).toEqual(['a', 'b'])
    expect(starts.a![0]).toBe(0)
    expect(starts.b![0]).toBeGreaterThanOrEqual(2000)
    expect(starts.a![1]).toBeGreaterThanOrEqual(2000)
  })

  // The virtual clock starts at epoch 0, so the date must precede 1970 to be in the past.
  it('retries immediately (0 ms) on a Retry-After http-date in the past', async () => {
    const { client, pauses } = setup([status(503, { 'Retry-After': 'Wed, 31 Dec 1969 23:59:00 GMT' }), json(1)])
    await client.json(URL_)
    expect(pauses).toEqual([0])
  })

  it('backs off with jitter without Retry-After', async () => {
    const { client, pauses } = setup([status(502), status(502), json(1)])
    await client.json(URL_)
    expect(pauses).toEqual([0.5 * Math.min(30000, 500 * 2 ** 1), 0.5 * Math.min(30000, 500 * 2 ** 2)])
    expect(pauses).toEqual([500, 1000])
  })

  it('does not retry 404', async () => {
    const { client, calls } = setup([status(404)])
    const err = await client.text(URL_).catch((e: unknown) => e) as HttpError
    expect(err).toBeInstanceOf(HttpError)
    expect(err).toMatchObject({ url: URL_, status: 404, attempts: 1 })
    expect(err.message).toContain(URL_)
    expect(calls).toHaveLength(1)
  })

  it('retries timeouts', async () => {
    const { client } = setup([new DOMException('timed out', 'TimeoutError'), json(1)])
    await expect(client.json(URL_)).resolves.toBe(1)
    expect(client.stats()).toMatchObject({ requests: 2, retries: 1, timeouts: 1, networkErrors: 0 })
  })

  it('treats AbortError as a timeout when the caller did not abort', async () => {
    const { client } = setup([new DOMException('aborted', 'AbortError'), json(1)])
    await expect(client.json(URL_)).resolves.toBe(1)
    expect(client.stats()).toMatchObject({ timeouts: 1 })
  })

  it('rethrows without retry when the caller aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const abortErr = new DOMException('aborted', 'AbortError')
    const { client, calls } = setup([abortErr, json(1)])
    await expect(client.json(URL_, { signal: ac.signal })).rejects.toBe(abortErr)
    expect(calls).toHaveLength(1)
    expect(client.stats()).toMatchObject({ requests: 1, retries: 0, timeouts: 0 })
  })

  it('retries a body read failure', async () => {
    const broken = {
      ok: true, status: 200, headers: new Headers(),
      text: () => Promise.reject(new TypeError('terminated')),
    } as unknown as Response
    const { client } = setup([broken, new Response('hello')])
    await expect(client.text(URL_)).resolves.toBe('hello')
    expect(client.stats()).toMatchObject({ requests: 2, retries: 1, networkErrors: 1, bytes: 5 })
  })

  it('rejects non-JSON 200 without retry', async () => {
    const { client, calls } = setup([new Response('<html>'), json(1)])
    const err = await client.json(URL_).catch((e: unknown) => e) as HttpError
    expect(err).toBeInstanceOf(HttpError)
    expect(err).toMatchObject({ url: URL_, status: 200, attempts: 1 })
    expect(err.message).toContain(URL_)
    expect(calls).toHaveLength(1)
  })

  it('returns a non-JSON 200 body from text()', async () => {
    const { client } = setup([new Response('<html>')])
    await expect(client.text(URL_)).resolves.toBe('<html>')
  })

  it('gives up after retries', async () => {
    const { client, calls } = setup([status(500), status(500), status(500), status(500), status(500)], { retries: 4 })
    const err = await client.json(URL_).catch((e: unknown) => e) as HttpError
    expect(err).toBeInstanceOf(HttpError)
    expect(err).toMatchObject({ url: URL_, status: 500, attempts: 5 })
    expect(calls).toHaveLength(5)
    expect(client.stats()).toMatchObject({ requests: 5, retries: 4, status5xx: 5 })
  })

  it('reports status null after the last network failure', async () => {
    const { client } = setup([new TypeError('fetch failed'), new TypeError('fetch failed')], { retries: 1 })
    const err = await client.text(URL_).catch((e: unknown) => e) as HttpError
    expect(err).toBeInstanceOf(HttpError)
    expect(err).toMatchObject({ url: URL_, status: null, attempts: 2 })
    expect(err.message).toContain(URL_)
    expect(client.stats()).toMatchObject({ networkErrors: 2 })
  })

  it('merges default headers with per-request headers', async () => {
    const { client, calls } = setup([json(1)], { headers: { Accept: 'application/json', 'X-A': 'default' } })
    await client.json(URL_, { headers: { 'X-A': 'override', 'X-B': 'b' } })
    const h = new Headers(calls[0]!.init!.headers)
    expect(h.get('accept')).toBe('application/json')
    expect(h.get('x-a')).toBe('override')
    expect(h.get('x-b')).toBe('b')
  })

  it('passes an AbortSignal to fetch', async () => {
    const { client, calls } = setup([json(1)])
    await client.json(URL_)
    expect(calls[0]!.url).toBe(URL_)
    expect(calls[0]!.init!.signal).toBeInstanceOf(AbortSignal)
  })
})
