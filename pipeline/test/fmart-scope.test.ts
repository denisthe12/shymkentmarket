import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLISH_CATEGORIES } from '../src/mapping/scope.js'
import { FMART_SCOPE, FMART_SECTIONS } from '../src/scrape/stores/fmart/scope.js'

describe('FMART_SECTIONS', () => {
  it('has unique numeric section and leaf ids', () => {
    const sections = FMART_SECTIONS.map(s => s.id)
    const leaves = FMART_SECTIONS.flatMap(s => [...s.leaves.keys(), ...s.excluded])
    expect(new Set(sections).size).toBe(sections.length)
    expect(new Set(leaves).size).toBe(leaves.length)
    for (const id of [...sections, ...leaves]) expect(id).toMatch(/^\d+$/)
  })

  it('never both takes and excludes a leaf', () => {
    for (const s of FMART_SECTIONS) for (const id of s.leaves.keys()) expect(s.excluded.has(id), id).toBe(false)
  })

  it('has exactly one fresh section, all vegetables', () => {
    const fresh = FMART_SECTIONS.filter(s => s.fresh)
    expect(fresh).toHaveLength(1)
    for (const l of fresh[0]!.leaves.values()) expect(l.slug).toBe('vegetables')
  })

  it('is flattened into FMART_SCOPE, keyed by leaf id', () => {
    expect(FMART_SCOPE).toEqual(FMART_SECTIONS.flatMap(s => [...s.leaves.values()]))
    for (const s of FMART_SECTIONS) for (const [id, l] of s.leaves) expect(l.id).toBe(id)
  })
})

describe('FMART_SCOPE', () => {
  it('takes loose flour and leaves out drinking straws', () => {
    expect(FMART_SCOPE.find(l => l.id === '4272')).toMatchObject({ slug: 'groats', path: ['Бакалея', 'Мука', 'Мука весовая'] })
    expect(FMART_SECTIONS.find(s => s.excluded.has('4169'))?.id).toBe('3352')
  })

  it('covers exactly the published slugs', () => {
    expect([...new Set(FMART_SCOPE.map(l => l.slug))].sort()).toEqual([...DEFAULT_PUBLISH_CATEGORIES].sort())
  })

  it('has unique clean three-level paths in sentence case', () => {
    expect(new Set(FMART_SCOPE.map(l => l.path.join('|'))).size).toBe(FMART_SCOPE.length)
    for (const l of FMART_SCOPE) {
      expect(l.path).toHaveLength(3)
      for (const part of l.path) expect(part).toMatch(/^[А-ЯЁ][а-яё]*(?:,? [а-яё]+)*$/)
    }
  })
})
