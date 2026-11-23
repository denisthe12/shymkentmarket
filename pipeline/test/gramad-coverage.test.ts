import { describe, expect, it } from 'vitest'
import type { SourceFile, SourceProduct } from '../src/types.js'
import { assertGramadCoverage } from '../src/scrape/stores/gramad/coverage.js'
import { GRAMAD_SCOPE } from '../src/scrape/stores/gramad/scope.js'

/** Ordinary volumes by section id; sections not listed hold one product. */
const NORMAL: Record<string, number> = {
  ...Object.fromEntries(GRAMAD_SCOPE.map(c => [c.id, 1])),
  '45857678': 27, '45857851': 20, '45857774': 26, '45857786': 29, '45857904': 37, '48384444': 16, '45857736': 21,
  '45857633': 13, '45857680': 15, '45857643': 91, '45857754': 20, '45857689': 29, '45857778': 18,
  '45857673': 29, '47431088': 27, '45857903': 59,
}
const MINIMUMS = [
  ['45857678', 13], ['45857851', 10], ['45857774', 13], ['45857786', 14], ['45857904', 18], ['48384444', 8], ['45857736', 10],
  ['45857633', 6], ['45857680', 7], ['45857643', 45], ['45857754', 10], ['45857689', 14], ['45857778', 9],
  ['45857673', 14], ['47431088', 13], ['45857903', 29],
] as const

const file = (counts: Record<string, number>, extra: string[] = []): SourceFile => {
  const ids = [...Object.entries(counts).flatMap(([id, n]) => Array<string>(n).fill(id)), ...extra]
  const products: SourceProduct[] = ids.map((categoryId, n) => ({
    sourceProductId: `gramad_${n}`,
    name: 'Товар',
    price: 100,
    oldPrice: null,
    imageUrl: null,
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: [],
    rawPayload: { categoryId },
  }))
  return { storeCode: 'GRAMAD', city: 'Shymkent', capturedAt: '2026-11-22T00:00:00.000Z', errorCount: 0, sourceStats: {}, products }
}

describe('assertGramadCoverage', () => {
  it('passes on ordinary volumes', () => {
    expect(() => assertGramadCoverage(file(NORMAL))).not.toThrow()
  })

  it('throws on an empty file', () => {
    expect(() => assertGramadCoverage(file({}))).toThrow(/no products/i)
  })

  it('names the slug that has no products', () => {
    expect(() => assertGramadCoverage(file({ ...NORMAL, '45857654': 0 }))).toThrow(/no products for fish/)
  })

  it('ignores products whose category is outside the scope', () => {
    expect(() => assertGramadCoverage(file({}, ['1']))).toThrow(/milk/)
  })

  it('refuses a partial section and names it', () => {
    expect(() => assertGramadCoverage(file({ ...NORMAL, '45857643': 9 }))).toThrow(
      /too few products: Макароны 9 of at least 45, keeping previous file/,
    )
  })

  it('refuses a fully lost section although its category is otherwise full', () => {
    expect(() => assertGramadCoverage(file({ ...NORMAL, '45857633': 0 }))).toThrow(/Овощи 0 of at least 6/)
  })

  it('lists every section below its minimum', () => {
    expect(() => assertGramadCoverage(file({ ...NORMAL, '45857643': 1, '45857754': 2 }))).toThrow(
      /Макароны 1 of at least 45, Рис и гречка 2 of at least 10/,
    )
  })

  it.each(MINIMUMS)('section %s: accepts its minimum %i and refuses one less', (id, min) => {
    expect(() => assertGramadCoverage(file({ ...NORMAL, [id]: min }))).not.toThrow()
    expect(() => assertGramadCoverage(file({ ...NORMAL, [id]: min - 1 }))).toThrow(/too few products/)
  })

  it('sections without a minimum may be empty while their category has products', () => {
    expect(() => assertGramadCoverage(file({ ...NORMAL, '45857772': 0 }))).not.toThrow()
  })
})
