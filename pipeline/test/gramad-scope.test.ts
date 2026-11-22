import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLISH_CATEGORIES } from '../src/mapping/scope.js'
import { GRAMAD_SCOPE } from '../src/scrape/stores/gramad/scope.js'

// Slugs the point has no own leaf for: salt shares the «Соль и сахар» leaf, which is mapped to 'sugar'.
const NO_OWN_LEAF = ['salt']

describe('GRAMAD_SCOPE', () => {
  it('has unique numeric section ids', () => {
    const ids = GRAMAD_SCOPE.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^\d+$/)
  })

  it('uses only published slugs', () => {
    for (const c of GRAMAD_SCOPE) expect(DEFAULT_PUBLISH_CATEGORIES).toContain(c.slug)
  })

  it('covers every published slug except those without an own leaf', () => {
    const slugs = new Set(GRAMAD_SCOPE.map(c => c.slug))
    for (const s of DEFAULT_PUBLISH_CATEGORIES) expect(slugs.has(s), s).toBe(!NO_OWN_LEAF.includes(s))
  })

  it('maps the shared salt and sugar leaf to sugar', () => {
    expect(GRAMAD_SCOPE.find(c => c.id === '45857917')?.slug).toBe('sugar')
  })

  it('has clean three-level paths', () => {
    for (const c of GRAMAD_SCOPE) {
      expect(c.path).toHaveLength(3)
      for (const part of c.path) {
        expect(part).toBe(part.trim())
        expect(part).not.toMatch(/\s{2}|\.$/)
      }
    }
  })
})
