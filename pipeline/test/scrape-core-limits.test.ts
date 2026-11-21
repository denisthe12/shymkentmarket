import { describe, expect, it } from 'vitest'
import { resolveLimit, resolveStoreLimits } from '../src/scrape/core/limits.js'

function collect() {
  const msgs: string[] = []
  return { msgs, warn: (m: string) => void msgs.push(m) }
}

describe('resolveLimit', () => {
  it('returns default for undefined', () => {
    const { msgs, warn } = collect()
    expect(resolveLimit(undefined, 'X', 4, 8, warn)).toBe(4)
    expect(msgs).toEqual([])
  })

  it('returns default for blank without warning', () => {
    const { msgs, warn } = collect()
    expect(resolveLimit('  ', 'X', 4, 8, warn)).toBe(4)
    expect(msgs).toEqual([])
  })

  it('accepts a valid value', () => {
    const { msgs, warn } = collect()
    expect(resolveLimit('6', 'X', 4, 8, warn)).toBe(6)
    expect(msgs).toEqual([])
  })

  it('clamps above the maximum with a warning', () => {
    const { msgs, warn } = collect()
    expect(resolveLimit('12', 'X', 4, 8, warn)).toBe(8)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('X')
    expect(msgs[0]).toContain('8')
  })

  it.each(['0', '-1', '2.5', 'abc'])('falls back to default for %s with a warning', (raw) => {
    const { msgs, warn } = collect()
    expect(resolveLimit(raw, 'X', 4, 8, warn)).toBe(4)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('X')
  })
})

describe('resolveStoreLimits', () => {
  it('reads <STORE>_CONCURRENCY and <STORE>_RPS and clamps', () => {
    const { msgs, warn } = collect()
    const limits = { concurrency: 4, rps: 8, maxConcurrency: 8, maxRps: 20 }
    const env = { MAGNUM_CONCURRENCY: '6', MAGNUM_RPS: '50' }
    expect(resolveStoreLimits('MAGNUM', limits, env, warn)).toEqual({ concurrency: 6, rps: 20 })
    expect(msgs).toHaveLength(1)
  })
})
