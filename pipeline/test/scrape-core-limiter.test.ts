import { describe, expect, it } from 'vitest'
import { Limiter, type Clock } from '../src/scrape/core/limiter.js'

// Event-driven virtual clock: sleepers are woken in time order, and time jumps
// to the earliest timer only once all pending microtasks have settled.
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

describe('Limiter', () => {
  it('never runs more than concurrency at once', async () => {
    const clock = virtualClock()
    const limiter = new Limiter({ concurrency: 3, rps: 1000, clock })
    let active = 0, peak = 0
    await Promise.all(Array.from({ length: 10 }, () => limiter.run(async () => {
      active++; peak = Math.max(peak, active)
      await clock.sleep(5)
      active--
    })))
    expect(peak).toBe(3)
  })

  it('spaces starts at 1000/rps', async () => {
    const clock = virtualClock()
    const limiter = new Limiter({ concurrency: 10, rps: 4, clock })
    const starts: number[] = []
    await Promise.all(Array.from({ length: 5 }, () => limiter.run(async () => { starts.push(clock.now()) })))
    expect(starts).toEqual([0, 250, 500, 750, 1000])
  })

  it('pauseUntil holds starts until the pause has passed', async () => {
    const clock = virtualClock()
    const limiter = new Limiter({ concurrency: 10, rps: 1000, clock })
    limiter.pauseUntil(500)
    const starts: number[] = []
    await Promise.all(Array.from({ length: 2 }, () => limiter.run(async () => { starts.push(clock.now()) })))
    expect(starts).toEqual([500, 501])
  })

  it('pauseUntil never shortens an existing pause', async () => {
    const clock = virtualClock()
    const limiter = new Limiter({ concurrency: 1, rps: 1000, clock })
    limiter.pauseUntil(800)
    limiter.pauseUntil(200)
    let started = -1
    await limiter.run(async () => { started = clock.now() })
    expect(started).toBe(800)
  })

  it('a pause set while a start is pending delays that start', async () => {
    const clock = virtualClock()
    const limiter = new Limiter({ concurrency: 10, rps: 1, clock })
    const starts: number[] = []
    const first = limiter.run(async () => {
      starts.push(clock.now())
      limiter.pauseUntil(2500)
    })
    const second = limiter.run(async () => { starts.push(clock.now()) })
    await Promise.all([first, second])
    expect(starts).toEqual([0, 2500])
  })

  it('a rejected fn releases its slot', async () => {
    const clock = virtualClock()
    const limiter = new Limiter({ concurrency: 1, rps: 1000, clock })
    const boom = new Error('boom')
    const first = limiter.run(async () => { throw boom })
    const second = limiter.run(async () => 'ok')
    await expect(first).rejects.toBe(boom)
    await expect(second).resolves.toBe('ok')
  })
})
