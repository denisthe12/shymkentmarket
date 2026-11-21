import { describe, expect, it } from 'vitest'
import { runTasks } from '../src/scrape/core/queue.js'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('runTasks', () => {
  it('runs tasks enqueued by tasks', async () => {
    const seen: number[] = []
    const res = await runTasks<number>(
      [1],
      async (n, enqueue) => {
        seen.push(n)
        if (n < 4) {
          enqueue(n + 1)
          enqueue(n + 10)
        }
      },
      { concurrency: 2, onError: () => {} },
    )
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 11, 12, 13])
    expect(res).toEqual({ done: 7, failed: 0 })
  })

  it('never exceeds concurrency', async () => {
    let active = 0
    let peak = 0
    const seeds = Array.from({ length: 20 }, (_, i) => i)
    const res = await runTasks<number>(
      seeds,
      async () => {
        active++
        peak = Math.max(peak, active)
        await sleep(5)
        active--
      },
      { concurrency: 4, onError: () => {} },
    )
    expect(peak).toBe(4)
    expect(res.done).toBe(20)
  })

  it('a failing task is reported and others continue', async () => {
    const errors: Array<[number, unknown]> = []
    const ran: number[] = []
    const boom = new Error('boom')
    const res = await runTasks<number>(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw boom
        ran.push(n)
      },
      { concurrency: 2, onError: (t, e) => errors.push([t, e]) },
    )
    expect(errors).toEqual([[2, boom]])
    expect(ran.sort()).toEqual([1, 3])
    expect(res).toEqual({ done: 2, failed: 1 })
  })

  it('treats a synchronous throw as a failure', async () => {
    const errors: number[] = []
    const res = await runTasks<number>(
      [1, 2],
      ((n: number) => {
        if (n === 1) throw new Error('sync')
        return Promise.resolve()
      }) as never,
      { concurrency: 1, onError: (t) => errors.push(t) },
    )
    expect(errors).toEqual([1])
    expect(res).toEqual({ done: 1, failed: 1 })
  })

  it('processes tasks enqueued late by a slow handler after others went idle', async () => {
    const seen: string[] = []
    const res = await runTasks<string>(
      ['slow', 'fast'],
      async (t, enqueue) => {
        seen.push(t)
        if (t === 'slow') {
          await sleep(20)
          enqueue('late')
        }
      },
      { concurrency: 3, onError: () => {} },
    )
    expect(seen).toContain('late')
    expect(res).toEqual({ done: 3, failed: 0 })
  })

  it('keeps going when onError throws', async () => {
    const res = await runTasks<number>(
      [1, 2],
      async (n) => {
        if (n === 1) throw new Error('x')
      },
      {
        concurrency: 1,
        onError: () => {
          throw new Error('handler of errors failed')
        },
      },
    )
    expect(res).toEqual({ done: 1, failed: 1 })
  })

  it('stopOnError: starts no new task after the first failure', async () => {
    const ran: string[] = []
    const res = await runTasks<string>(
      ['fail', 'slow', 'x', 'y'],
      async (t, enqueue) => {
        ran.push(t)
        if (t === 'fail') throw new Error('boom')
        if (t === 'slow') {
          await sleep(20)
          enqueue('late')
        }
      },
      { concurrency: 2, onError: () => {}, stopOnError: true },
    )
    expect(ran).toEqual(['fail', 'slow'])
    expect(res).toEqual({ done: 1, failed: 1, skipped: 3 })
  })

  it('stopOnError without failures runs everything and reports skipped 0', async () => {
    const res = await runTasks<number>([1, 2, 3], async () => {}, { concurrency: 2, onError: () => {}, stopOnError: true })
    expect(res).toEqual({ done: 3, failed: 0, skipped: 0 })
  })

  it('resolves for empty seeds', async () => {
    const res = await runTasks<number>([], async () => {}, { concurrency: 3, onError: () => {} })
    expect(res).toEqual({ done: 0, failed: 0 })
  })
})
