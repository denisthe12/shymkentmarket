import { describe, expect, it } from 'vitest'
import { MIN_BY_SECTION, MIN_FRESH_KG, MIN_WEIGHTED_FLAG, assertFmartCoverage } from '../src/scrape/stores/fmart/coverage.js'
import { FMART_SECTIONS } from '../src/scrape/stores/fmart/scope.js'
import type { SourceFile, SourceProduct } from '../src/types.js'

const STATS = { weightedFlag: MIN_WEIGHTED_FLAG, weightedFresh: MIN_FRESH_KG, unknownLeafProducts: 0 }
/** Every section at its minimum (at least one product per leaf). */
const NORMAL: Record<string, number> = Object.fromEntries(FMART_SECTIONS.map(s => [s.id, Math.max(MIN_BY_SECTION[s.id] ?? 0, s.leaves.size)]))

function file(counts: Record<string, number>, stats: Record<string, number> = STATS, drop: (leafId: string) => boolean = () => false): SourceFile {
  const products: SourceProduct[] = FMART_SECTIONS.flatMap(s => {
    const leaves = [...s.leaves.keys()]
    return Array.from({ length: counts[s.id] ?? 0 }, (_, i) => leaves[i % leaves.length]!)
      .filter(id => !drop(id))
      .map((leafId, i) => ({
        sourceProductId: `fmart_${s.id}_${i}`, name: 'Товар', price: 100, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null,
        sourceCategoryPath: [], rawPayload: { sectionId: s.id, leafId, categoryId: leafId },
      }))
  })
  return { storeCode: 'FMART', city: 'Shymkent', capturedAt: '2026-11-23T00:00:00.000Z', errorCount: 0, sourceStats: { ...stats }, products }
}

describe('assertFmartCoverage', () => {
  it('passes at the minimums', () => {
    expect(() => assertFmartCoverage(file(NORMAL))).not.toThrow()
  })

  it('has minimums for known sections only', () => {
    const ids = FMART_SECTIONS.map(s => s.id)
    for (const id of Object.keys(MIN_BY_SECTION)) expect(ids).toContain(id)
    expect(MIN_FRESH_KG).toBe(15)
    expect(MIN_WEIGHTED_FLAG).toBe(62)
    expect(MIN_BY_SECTION).toEqual({
      '3352': 36, '3339': 32, '3098': 33, '3096': 21, '3268': 9, '3314': 56, '3249': 19,
      '3269': 169, '100014': 13, '3136': 16, '3421': 13, '3816': 21, '4293': 15, '3150': 84,
      '3116': 30, '3094': 152, '3374': 30, '3076': 38, '3091': 82, '3618': 17, '3709': 55,
    })
  })

  it('throws on an empty file', () => {
    expect(() => assertFmartCoverage(file({}))).toThrow(/no products scraped/)
  })

  it('names the slug without products', () => {
    const salt = FMART_SECTIONS.flatMap(s => [...s.leaves.values()]).filter(l => l.slug === 'salt').map(l => l.id)
    expect(() => assertFmartCoverage(file({ ...NORMAL, '3374': 100 }, STATS, id => salt.includes(id)))).toThrow(/no products for salt/)
  })

  it.each(Object.entries(MIN_BY_SECTION))('section %s: refuses one product less than %i and names the section', (id, min) => {
    const name = [...FMART_SECTIONS.find(s => s.id === id)!.leaves.values()][0]!.path[1]
    expect(() => assertFmartCoverage(file({ ...NORMAL, [id]: min }))).not.toThrow()
    expect(() => assertFmartCoverage(file({ ...NORMAL, [id]: min - 1 }))).toThrow(`${name} ${min - 1} of at least ${min}`)
  })

  it('lets sections without a minimum be empty while the slug has products', () => {
    expect(() => assertFmartCoverage(file({ ...NORMAL, '100003': 0, '3799': 0, '3498': 0 }))).not.toThrow()
  })

  it('refuses too few weighted or fresh goods', () => {
    expect(() => assertFmartCoverage(file(NORMAL, { ...STATS, weightedFlag: MIN_WEIGHTED_FLAG - 1 }))).toThrow(/weightedFlag 61 of at least 62/)
    expect(() => assertFmartCoverage(file(NORMAL, { ...STATS, weightedFresh: MIN_FRESH_KG - 1 }))).toThrow(/weightedFresh 14 of at least 15/)
  })

  it.each(['weightedFlag', 'weightedFresh', 'unknownLeafProducts'] as const)('refuses a missing or NaN %s', key => {
    const { [key]: _drop, ...rest } = STATS
    expect(() => assertFmartCoverage(file(NORMAL, rest))).toThrow(key)
    expect(() => assertFmartCoverage(file(NORMAL, { ...STATS, [key]: Number.NaN }))).toThrow(key)
  })

  it('allows exactly 10% of unknown leaves and refuses more', () => {
    const base = file(NORMAL).products.length
    const pad = (9 - (base % 9)) % 9
    const counts = { ...NORMAL, '3094': NORMAL['3094']! + pad }
    const tenth = (base + pad) / 9
    expect(() => assertFmartCoverage(file(counts, { ...STATS, unknownLeafProducts: tenth }))).not.toThrow()
    expect(() => assertFmartCoverage(file(counts, { ...STATS, unknownLeafProducts: tenth + 1 }))).toThrow(/unknownLeafProducts/)
  })
})
