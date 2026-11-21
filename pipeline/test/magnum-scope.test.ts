import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLISH_CATEGORIES } from '../src/mapping/scope.js'
import { MAGNUM_SCOPE } from '../src/scrape/stores/magnum/scope.js'

describe('MAGNUM_SCOPE', () => {
  it('has the approved 38 leaves', () => {
    expect(MAGNUM_SCOPE).toHaveLength(38)
  })

  it('uses only published slugs', () => {
    for (const c of MAGNUM_SCOPE) expect(DEFAULT_PUBLISH_CATEGORIES).toContain(c.slug)
  })

  it('covers every published category', () => {
    const slugs = new Set(MAGNUM_SCOPE.map(c => c.slug))
    for (const s of DEFAULT_PUBLISH_CATEGORIES) expect(slugs.has(s), s).toBe(true)
  })

  it('has unique six-digit ids outside roots 51 and 60', () => {
    const ids = MAGNUM_SCOPE.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^\d{6}$/)
      expect(id.startsWith('51')).toBe(false)
      expect(id.startsWith('60')).toBe(false)
    }
  })

  it('has trimmed three-level paths from the root', () => {
    for (const c of MAGNUM_SCOPE) {
      expect(c.path).toHaveLength(3)
      expect(c.path[0]).toBe('Продукты')
      for (const part of c.path) expect(part).toBe(part.trim())
    }
  })
})
