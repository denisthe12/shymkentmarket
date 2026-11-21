import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/agent/bundle.js'
import { buildDictionary } from '../src/mapping/dictionary.js'
import { refineCategory } from '../src/mapping/milk.js'
import { publishCategories } from '../src/mapping/scope.js'
import { assertFresh, buildSyncBundle } from '../src/sync/sync.js'
import type { SourceFile } from '../src/types.js'
import { cp, STORE_A, STORE_B, STORE_C } from './helpers.js'

const a = cp(STORE_B, '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp(STORE_A, 'a_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const f = cp(STORE_C, 'c_3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.sourceCategoryPath = ['Молоко']
const day0 = '2026-10-06T06:00:00.000Z'
const meta = (s: SourceFile['storeCode']) => ({ storeCode: s, city: 'Shymkent' as const, capturedAt: day0, errorCount: 0, sourceStats: {} })
const dict = buildDictionary(buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [f], method: 'deterministic', confidence: 1, review: 'approved' },
], ([STORE_B, STORE_A, STORE_C]).map(meta), day0))

const today = (extraB: SourceFile['products'] = []): SourceFile[] => [
  { ...meta(STORE_B), products: [{ ...a.product, price: 610 }, ...extraB] },
  { ...meta(STORE_A), products: [b.product] },
  { ...meta(STORE_C), products: [f.product] },
]

describe('sync pending isolation', () => {
  it('a pending dictionary group is published as separate single-store cards', () => {
    const pendingDict = buildDictionary(buildBundle([
      { members: [a, b], method: 'ai', confidence: 0.85, review: 'pending' },
      { members: [f], method: 'deterministic', confidence: 1, review: 'approved' },
    ], ([STORE_B, STORE_A, STORE_C]).map(meta), day0))
    const { bundle } = buildSyncBundle(today(), pendingDict, '2026-10-07T06:00:00.000Z')
    const milk = bundle.canonicalProducts.filter((g) => g.category === 'milk')
    expect(milk).toHaveLength(2)
    for (const g of milk) {
      expect(g.members).toHaveLength(1)
      expect(g.members[0]!.reviewStatus).toBe('pending')
    }
  })
})

describe('sync', () => {
  it('known products keep their dictionary card and take today prices', () => {
    const { bundle, unmapped } = buildSyncBundle(today(), dict, '2026-10-07T06:00:00.000Z')
    expect(unmapped).toEqual([])
    const milk = bundle.canonicalProducts.find((g) => g.category === 'milk')!
    expect(milk.members.map((m) => m.rawProduct.storeCode).sort()).toEqual([STORE_A, STORE_B])
    expect(milk.members.find((m) => m.rawProduct.storeCode === STORE_B)!.rawProduct.price).toBe(610)
    expect(milk).toMatchObject({ canonicalName: Object.values(dict.canonicals).find((c) => c.category === 'milk')!.name, attributes: { volumeMl: 1000, fatPercent: 3.2 } })
    expect(milk.members[0]).toMatchObject({ matchMethod: 'ai', matchConfidence: 0.97, reviewStatus: 'approved' })
  })
  it('unknown product becomes a pending singleton in the learned store category', () => {
    const fresh = { ...a.product, sourceProductId: '99', name: 'Молоко Новое 2.5% 900 мл', sourceCategoryPath: ['Молоко'] }
    const { bundle, unmapped } = buildSyncBundle(today([fresh]), dict, '2026-10-07T06:00:00.000Z')
    expect(unmapped).toEqual([expect.objectContaining({ storeCode: STORE_B, sourceProductId: '99', guessedCategory: 'milk' })])
    const g = bundle.canonicalProducts.find((x) => x.members.some((m) => m.rawProduct.sourceProductId === '99'))!
    expect(g).toMatchObject({ category: 'milk', attributes: { volumeMl: 900, fatPercent: 2.5 } })
    expect(g.members).toHaveLength(1)
    expect(g.members[0]).toMatchObject({ matchMethod: 'deterministic', reviewStatus: 'pending' })
  })
  it('every raw appears in exactly one group (Go bundle contract)', () => {
    const { bundle } = buildSyncBundle(today(), dict, '2026-10-07T06:00:00.000Z')
    expect(bundle.canonicalProducts.flatMap((g) => g.members)).toHaveLength(bundle.rawProducts.length)
    expect(bundle.sourceRuns.map((s) => s.storeCode).sort()).toEqual([STORE_A, STORE_B, STORE_C])
  })
  it('publishes only categories in scope and reports no out-of-scope unmapped products', () => {
    const fresh = { ...f.product, sourceProductId: 'c_new', name: 'Новая штука 5 кг', sourceCategoryPath: ['Для дома'] }
    const files = today(); files[2]!.products.push(fresh)
    const { bundle, unmapped } = buildSyncBundle(files, dict, '2026-10-07T06:00:00.000Z', new Set(['milk'] as const))
    expect(bundle.canonicalProducts.map((g) => g.category)).toEqual(['milk'])
    expect(bundle.rawProducts.every((r) => r.storeCode !== STORE_C)).toBe(true)
    expect(bundle.sourceRuns.map((r) => [r.storeCode, r.productCount])).toEqual([[STORE_B, 1], [STORE_A, 1], [STORE_C, 0]])
    expect(unmapped).toEqual([])
  })
  it('refuses stale or missing source files', () => {
    const now = new Date('2026-10-07T06:00:00.000Z')
    expect(() => assertFresh(today(), [STORE_B, STORE_A, STORE_C], now, 36)).not.toThrow()
    expect(() => assertFresh(today().slice(0, 2), [STORE_B, STORE_A, STORE_C], now, 36)).toThrow(/STORE_C: source file missing/)
    expect(() => assertFresh(today(), [STORE_B, STORE_A, STORE_C], new Date('2026-10-09T06:00:00.000Z'), 36)).toThrow(/stale/)
  })
  it('sync code never touches the LLM', () => {
    for (const file of ['../src/sync/sync.ts', '../src/cli/sync.ts', '../src/mapping/dictionary.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(src).not.toMatch(/gemini|classifyBatch|matchBlock|GEMINI_API_KEY/)
    }
  })
})

describe('SCRUM-19 milk refinement', () => {
  const at = '2026-10-07T06:00:00.000Z'
  const filesOf = (...ps: ReturnType<typeof cp>[]): SourceFile[] => {
    const by = (s: SourceFile['storeCode']) => ps.filter((p) => p.storeCode === s).map((p) => p.product)
    return ([STORE_B, STORE_A, STORE_C]).map((s) => ({ ...meta(s), products: by(s) }))
  }
  const dictOf = (...groups: ReturnType<typeof cp>[][]) => buildDictionary(buildBundle(
    groups.map((members) => ({ members, method: 'ai' as const, confidence: 0.97, review: 'approved' as const })),
    ([STORE_B, STORE_A, STORE_C]).map(meta), day0))

  it('known card named "Сливки …" in milk is published as dairy', () => {
    const cream = cp(STORE_B, 'c1', 'Сливки Домик в деревне 20% 200 г', { weightGrams: 200, fatPercent: 20 })
    const { bundle } = buildSyncBundle(filesOf(cream), dictOf([cream]), at)
    expect(bundle.canonicalProducts).toHaveLength(1)
    expect(bundle.canonicalProducts[0]!.category).toBe('dairy')
  })
  it('all members of a known card get the same refined category', () => {
    const itemB = cp(STORE_B, 'm1', 'Сливки Савушкин 10% 1 л', { volumeMl: 1000, fatPercent: 10 })
    const itemA = cp(STORE_A, 'm2', 'Молоко Савушкин 3.1% 1 л', { volumeMl: 1000, fatPercent: 3.1 })
    const d = dictOf([itemB, itemA])
    const card = Object.values(d.canonicals)[0]!
    const { bundle } = buildSyncBundle(filesOf(itemB, itemA), d, at)
    expect(bundle.canonicalProducts).toHaveLength(1)
    const g = bundle.canonicalProducts[0]!
    expect(g.members).toHaveLength(2)
    expect(g.category).toBe(refineCategory('milk', card.name, card.attributes.fatPercent))
    expect(g.members.map((m) => m.rawProduct.storeCode).sort()).toEqual([STORE_A, STORE_B])
  })
  it('unmapped cream from a milk store section is published as dairy', () => {
    const fresh = { ...a.product, sourceProductId: '99', name: 'Сливки Килегей 10% 320 г', sourceCategoryPath: ['Молоко'] }
    const { bundle, unmapped } = buildSyncBundle(today([fresh]), dict, at)
    expect(unmapped).toEqual([expect.objectContaining({ sourceProductId: '99', guessedCategory: 'dairy' })])
    const g = bundle.canonicalProducts.find((x) => x.members.some((m) => m.rawProduct.sourceProductId === '99'))!
    expect(g.category).toBe('dairy')
  })
  it('plant drink is dropped by publish scope', () => {
    const oat = cp(STORE_B, 'o1', 'Напиток овсяный Nemoloko 1 л', { volumeMl: 1000 })
    const { bundle } = buildSyncBundle(filesOf(oat), dictOf([oat]), at, publishCategories(''))
    expect(bundle.canonicalProducts.some((g) => g.canonicalName.includes('Nemoloko'))).toBe(false)
    expect(bundle.canonicalProducts.some((g) => g.category === 'drinks')).toBe(false)
  })
})

describe('assertFresh after a failed scrape', () => {
  const now = new Date('2026-10-07T06:00:00.000Z')
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  const filesWith = (ageA: number): SourceFile[] => [
    { ...meta(STORE_B), capturedAt: ago(1), products: [a.product] },
    { ...meta(STORE_A), capturedAt: ago(ageA), products: [b.product] },
    { ...meta(STORE_C), capturedAt: ago(1), products: [f.product] },
  ]
  it('does not throw while the failed store file is still within maxAge', () => {
    expect(() => assertFresh(filesWith(20), [STORE_B, STORE_A, STORE_C], now, 36)).not.toThrow()
  })
  it('throws when the failed store file is older than maxAge', () => {
    expect(() => assertFresh(filesWith(40), [STORE_B, STORE_A, STORE_C], now, 36)).toThrow(/STORE_A: source file is stale/)
  })
})
