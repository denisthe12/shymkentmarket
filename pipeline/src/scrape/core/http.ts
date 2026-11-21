import { Buffer } from 'node:buffer'
import { realClock, type Clock, type Limiter } from './limiter.js'

export type HttpStats = {
  requests: number
  retries: number
  status429: number
  status5xx: number
  timeouts: number
  networkErrors: number
  bytes: number
}

export class HttpError extends Error {
  readonly url: string
  readonly status: number | null
  readonly attempts: number

  constructor(message: string, url: string, status: number | null, attempts: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'HttpError'
    this.url = url
    this.status = status
    this.attempts = attempts
  }
}

export type HttpClientOptions = {
  limiter: Limiter
  headers?: Record<string, string>
  timeoutMs?: number
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  fetchImpl?: typeof fetch
  clock?: Clock
  random?: () => number
}

export type HttpClient = {
  json<T = unknown>(url: string, init?: RequestInit): Promise<T>
  text(url: string, init?: RequestInit): Promise<string>
  stats(): HttpStats
}

/** Outcome of one attempt (fetch + body read), decided inside the limiter slot. */
type Attempt =
  | { kind: 'ok'; status: number; body: string }
  | { kind: 'status'; status: number; retryAfter: string | null }
  | { kind: 'error'; timeout: boolean; error: unknown }

const isAbortLike = (e: unknown) =>
  e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')

// IMF-fixdate, e.g. "Sun, 06 Nov 1994 08:49:37 GMT". Date.parse alone is too
// lenient (it accepts "-5", "1.5", "soon 5"), so only this shape reaches it.
const IMF_FIXDATE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/

/**
 * Parses Retry-After (delta-seconds or IMF-fixdate) into milliseconds, or null
 * if unusable (caller then falls back to jitter). A date in the past gives 0.
 */
function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null
  const v = value.trim()
  if (/^\d+$/.test(v)) return Number(v) * 1000
  if (!IMF_FIXDATE.test(v)) return null
  const at = Date.parse(v)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}

export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const {
    limiter,
    timeoutMs = 20_000,
    retries = 4,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    fetchImpl = fetch,
    clock = realClock,
    random = Math.random,
  } = opts
  const defaultHeaders = opts.headers ?? {}
  const stats: HttpStats = { requests: 0, retries: 0, status429: 0, status5xx: 0, timeouts: 0, networkErrors: 0, bytes: 0 }

  const attemptOnce = (url: string, init: RequestInit | undefined): Promise<Attempt> =>
    limiter.run(async () => {
      const headers = new Headers(defaultHeaders)
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v))
      const timeout = AbortSignal.timeout(timeoutMs)
      const signal = init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout
      try {
        const res = await fetchImpl(url, { ...init, headers, signal })
        if (!res.ok) {
          res.body?.cancel().catch(() => {})
          return { kind: 'status', status: res.status, retryAfter: res.headers.get('retry-after') }
        }
        const body = await res.text()
        // Decoded body length in UTF-8, not wire bytes (compression/charset ignored).
        stats.bytes += Buffer.byteLength(body, 'utf8')
        return { kind: 'ok', status: res.status, body }
      } catch (error) {
        if (init?.signal?.aborted) throw error // caller cancelled: no retry
        return { kind: 'error', timeout: isAbortLike(error), error }
      }
    })

  const request = async (url: string, init: RequestInit | undefined): Promise<{ status: number; body: string; attempts: number }> => {
    for (let attempt = 1; ; attempt++) {
      stats.requests++
      if (attempt > 1) stats.retries++
      const r = await attemptOnce(url, init)
      if (r.kind === 'ok') return { status: r.status, body: r.body, attempts: attempt }

      let retryAfterMs: number | null = null
      let serverBusy = false // 429/503: the pause applies to every request, not just this one
      if (r.kind === 'status') {
        const retryable = r.status === 429 || r.status >= 500
        if (r.status === 429) stats.status429++
        if (r.status >= 500) stats.status5xx++
        if (!retryable || attempt > retries) {
          throw new HttpError(`HTTP ${r.status} for ${url} after ${attempt} attempt(s)`, url, r.status, attempt)
        }
        if (r.status === 429 || r.status === 503) {
          serverBusy = true
          retryAfterMs = parseRetryAfter(r.retryAfter, clock.now())
        }
      } else {
        if (r.timeout) stats.timeouts++
        else stats.networkErrors++
        if (attempt > retries) {
          const what = r.timeout ? 'timeout' : `network error (${r.error instanceof Error ? r.error.message : String(r.error)})`
          throw new HttpError(`${what} for ${url} after ${attempt} attempt(s)`, url, null, attempt, { cause: r.error })
        }
      }

      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      let delay: number
      if (retryAfterMs !== null) delay = Math.min(retryAfterMs, maxDelayMs)
      else if (r.kind === 'status' && r.status === 429) {
        // Rate-limited without a usable Retry-After: never retry sooner than baseDelayMs.
        const floor = Math.min(baseDelayMs, maxDelayMs)
        delay = floor + random() * Math.max(0, cap - floor)
      } else delay = random() * cap
      if (serverBusy) limiter.pauseUntil(clock.now() + delay)
      await clock.sleep(delay)
    }
  }

  return {
    async text(url, init) {
      return (await request(url, init)).body
    },
    async json<T = unknown>(url: string, init?: RequestInit): Promise<T> {
      const { status, body, attempts } = await request(url, init)
      try {
        return JSON.parse(body) as T
      } catch (error) {
        throw new HttpError(`invalid JSON (HTTP ${status}) for ${url}`, url, status, attempts, { cause: error })
      }
    },
    stats: () => ({ ...stats }),
  }
}
