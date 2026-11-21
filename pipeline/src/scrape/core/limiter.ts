export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> }

export const realClock: Clock = {
  // Must stay epoch milliseconds (Date.now()): parseRetryAfter in http.ts
  // compares Retry-After HTTP-dates against it. Do not switch to performance.now().
  now: () => Date.now(),
  sleep: ms => new Promise<void>(resolve => setTimeout(resolve, ms)),
}

/**
 * Bounds concurrency and paces request starts.
 *
 * Order: a task first acquires a concurrency slot (FIFO), then reserves its
 * start time `max(now, lastStart + 1000/rps, pausedUntil)` synchronously (so
 * reservations are strictly ordered and spaced), sleeps until it, runs, and
 * releases the slot in `finally`. Tasks queued for a slot never hold a pace
 * reservation. If a pause is set or extended while a task sleeps, the task
 * reserves again after waking, so starts after a pause stay spaced.
 */
export class Limiter {
  private readonly concurrency: number
  private readonly interval: number
  private readonly clock: Clock
  private active = 0
  private lastStart = -Infinity
  private pausedUntil = -Infinity
  private readonly waiters: Array<() => void> = []

  constructor(opts: { concurrency: number; rps: number; clock?: Clock }) {
    if (!(opts.concurrency >= 1)) throw new Error('concurrency must be >= 1')
    if (!(opts.rps > 0)) throw new Error('rps must be > 0')
    this.concurrency = opts.concurrency
    this.interval = 1000 / opts.rps
    this.clock = opts.clock ?? realClock
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      for (;;) {
        const now = this.clock.now()
        if (now >= this.pausedUntil && now >= this.lastStart + this.interval) {
          this.lastStart = now
          break
        }
        const start = Math.max(now, this.lastStart + this.interval, this.pausedUntil)
        this.lastStart = start
        await this.clock.sleep(start - now)
        if (this.clock.now() >= this.pausedUntil) break
      }
      return await fn()
    } finally {
      this.release()
    }
  }

  /**
   * Holds every attempt start until `t` (in `clock.now()` units), e.g. after a
   * 429/503 from the server. Keeps the later of the current and the new pause.
   */
  pauseUntil(t: number): void {
    if (t > this.pausedUntil) this.pausedUntil = t
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++
      return Promise.resolve()
    }
    return new Promise<void>(resolve => this.waiters.push(resolve))
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next) next() // slot handed over; active count unchanged
    else this.active--
  }
}
