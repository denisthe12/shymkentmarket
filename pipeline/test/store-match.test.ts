import { describe, expect, it } from 'vitest'
import type { CategorySlug } from '../src/agent/taxonomy.js'
import { canonicalKey, DictionarySchema, storeCategoryKey, type Dictionary, type DictionaryCanonical } from '../src/mapping/dictionary.js'
import { applyDecisions, buildCandidates, MatchDecisionSchema, validateDecisions, type MatchCandidate, type MatchDecision, type MatchItem } from '../src/mapping/store-match.js'

const card = (name: string, category: CategorySlug, attributes: Record<string, number>): DictionaryCanonical =>
  ({ name, brand: null, category, attributes, method: 'deterministic', confidence: 1, review: 'approved' })

const base: Dictionary = DictionarySchema.parse({
  version: 1, generatedAt: '2026-10-05T20:42:51.173Z',
  canonicals: {
    c_milk1: card('Молоко Лактель 2,5% 1 л', 'milk', { volumeMl: 1000, fatPercent: 2.5 }),
    c_milk2: card('Молоко Лактель 2,5% 0,9 л', 'milk', { volumeMl: 900, fatPercent: 2.5 }),
    c_soap: card('Мыло Лактель детское 90 г', 'household', { weightGrams: 90 }),
    c_busy: card('Молоко Простоквашино 2,5% 1 л', 'milk', { volumeMl: 1000, fatPercent: 2.5 }),
  },
  products: { 'STORE_B:1': 'c_milk1', 'STORE_A:a_2': 'c_milk2', 'STORE_B:5': 'c_busy', 'MAGNUM:m_0': 'c_busy' },
  storeCategories: { 'STORE_B|Молоко': 'milk', 'MAGNUM|Старая категория': 'dairy' },
})

const cand = (key: string, weighted = false): MatchCandidate => {
  const c = base.canonicals[key]!
  return { key, name: c.name, brand: c.brand, category: c.category, attributes: c.attributes, weighted }
}
const item = (n: number, name: string, candidates: MatchCandidate[], path = ['Молочные продукты', 'Молоко'], weighted = false): MatchItem =>
  ({ id: `MAGNUM:m_${n}`, name, sourceCategoryPath: path, candidates, weighted })
const dec = (n: number, match: string | null, confidence: number, category = 'milk', displayName = 'Товар', brand: string | null = null): MatchDecision =>
  ({ id: `MAGNUM:m_${n}`, category: category as CategorySlug, match, confidence, displayName, brand })

describe('buildCandidates', () => {
  it('builds candidates only from scope categories and drops size conflicts', () => {
    const c = buildCandidates(base, 'Молоко Lactel 2,5% 1л лактель', new Set<CategorySlug>(['milk']))
    expect(c.map((x) => x.key)).toContain('c_milk1')
    expect(c.map((x) => x.key)).not.toContain('c_milk2') // 900 мл против 1000 мл
    expect(c.map((x) => x.key)).not.toContain('c_soap') // household вне scope
  })
  it('ranks by token overlap and caps at k', () => {
    const c = buildCandidates(base, 'Молоко Лактель 2,5% 1 л', new Set<CategorySlug>(['milk']), 1)
    expect(c.map((x) => x.key)).toEqual(['c_milk1'])
  })
})

describe('buildCandidates weighted flag', () => {
  it('takes weighted from the set of weighted cards, false by default', () => {
    const scope = new Set<CategorySlug>(['milk'])
    expect(buildCandidates(base, 'Молоко Лактель 2,5% 1 л', scope).every((c) => c.weighted === false)).toBe(true)
    const c = buildCandidates(base, 'Молоко Лактель 2,5% 1 л', scope, 8, new Set(['c_milk1']))
    expect(c.find((x) => x.key === 'c_milk1')!.weighted).toBe(true)
  })
})

describe('applyDecisions weight mismatch', () => {
  it('loose item does not attach to a packaged card', () => {
    const r = applyDecisions(base, 'MAGNUM', [item(1, 'Молоко Лактель', [cand('c_milk1', false)], undefined, true)], [dec(1, 'c_milk1', 0.98)])
    expect(r.stats).toMatchObject({ rejectedWeight: 1, attached: 0, created: 1 })
    expect(r.dict.products['MAGNUM:m_1']).not.toBe('c_milk1')
  })
  it('packaged item does not attach to a loose card', () => {
    const r = applyDecisions(base, 'MAGNUM', [item(1, 'Молоко Лактель', [cand('c_milk1', true)], undefined, false)], [dec(1, 'c_milk1', 0.98)])
    expect(r.stats).toMatchObject({ rejectedWeight: 1, attached: 0, created: 1 })
  })
  it('matching weight flag attaches as before', () => {
    const r = applyDecisions(base, 'MAGNUM', [item(1, 'Молоко Лактель', [cand('c_milk1', true)], undefined, true)], [dec(1, 'c_milk1', 0.98)])
    expect(r.stats).toMatchObject({ rejectedWeight: 0, attached: 1 })
    expect(r.dict.products['MAGNUM:m_1']).toBe('c_milk1')
  })
})

describe('applyDecisions', () => {
  const i1 = item(1, 'Молоко Лактель 2,5% 1 л', [cand('c_milk1')])
  const same = (r: ReturnType<typeof applyDecisions>) => {
    for (const k of Object.keys(base.canonicals)) expect(r.dict.canonicals[k]).toEqual(base.canonicals[k])
    for (const k of Object.keys(base.products)) expect(r.dict.products[k]).toBe(base.products[k])
    for (const k of Object.keys(base.storeCategories)) expect(r.dict.storeCategories[k]).toBe(base.storeCategories[k])
    expect(r.dict.generatedAt).toBe(base.generatedAt)
  }

  it('keeps every base mapping and card unchanged', () => {
    const r = applyDecisions(base, 'MAGNUM', [i1, item(3, 'Йогурт Х', [])], [dec(1, 'c_milk1', 0.99), dec(3, null, 0.2, 'dairy')])
    same(r)
  })
  it('attaches a confident decision to the chosen candidate', () => {
    const r = applyDecisions(base, 'MAGNUM', [i1], [dec(1, 'c_milk1', 0.99)])
    expect(r.dict.products['MAGNUM:m_1']).toBe('c_milk1')
    expect(r.stats.attached).toBe(1)
    expect(r.stats.created).toBe(0)
  })
  it('creates a pending singleton for a 0.8–0.95 decision and an approved one for no match', () => {
    const i2 = item(2, 'Молоко Лактель 2,5% 1 л', [cand('c_milk1')])
    const i3 = item(3, 'Что-то новое 500 г', [])
    const r = applyDecisions(base, 'MAGNUM', [i2, i3], [dec(2, 'c_milk1', 0.88), dec(3, null, 0.1, 'dairy')])
    const pending = r.dict.canonicals[canonicalKey(['MAGNUM:m_2'])]!
    expect(pending).toMatchObject({ review: 'pending', method: 'ai', confidence: 0.88, brand: null, category: 'milk' })
    expect(r.dict.products['MAGNUM:m_2']).toBe(canonicalKey(['MAGNUM:m_2']))
    expect(r.dict.canonicals[canonicalKey(['MAGNUM:m_3'])]).toMatchObject({ review: 'approved', method: 'deterministic', confidence: 1, category: 'dairy', attributes: { weightGrams: 500 } })
    expect(r.stats).toMatchObject({ attached: 0, created: 2, pendingSingletons: 1 })
  })
  it('names and brands a new card from the decision', () => {
    const it1 = item(6, 'МОЛОКО БРЕНД 3,2% 900МЛ', [])
    const r = applyDecisions(base, 'MAGNUM', [it1], [dec(6, null, 0.1, 'milk', 'Молоко Бренд 3,2% 900 мл', 'Бренд')])
    expect(r.dict.canonicals[canonicalKey(['MAGNUM:m_6'])]).toMatchObject({ name: 'Молоко Бренд 3,2% 900 мл', brand: 'Бренд', attributes: { volumeMl: 900, fatPercent: 3.2 } })
    expect(r.stats.rejectedName).toBe(0)
  })
  it('falls back to the source name when displayName conflicts with the source size', () => {
    const it1 = item(6, 'МОЛОКО БРЕНД 3,2% 900МЛ', [])
    const r = applyDecisions(base, 'MAGNUM', [it1], [dec(6, null, 0.1, 'milk', 'Молоко Бренд 3.2% 1 л', 'Бренд')])
    const c = r.dict.canonicals[canonicalKey(['MAGNUM:m_6'])]!
    expect(c.name).toBe('МОЛОКО БРЕНД 3,2% 900МЛ')
    expect(c.attributes).toEqual({ volumeMl: 900, fatPercent: 3.2 })
    expect(r.stats.rejectedName).toBe(1)
  })
  it('normalizes an empty brand to null', () => {
    expect(MatchDecisionSchema.parse(dec(1, null, 0.5, 'milk', 'Молоко', '')).brand).toBeNull()
    expect(MatchDecisionSchema.parse(dec(1, null, 0.5, 'milk', 'Молоко', '  ')).brand).toBeNull()
  })
  it('rejects a blank displayName in validateDecisions', () => {
    expect(validateDecisions([item(1, 'a', [])], [dec(1, null, 0.1, 'milk', '  ')])).not.toBeNull()
  })
  it('rejects a size in displayName for a weighted item', () => {
    const it1 = item(7, 'Картофель', [], ['Овощи'], true)
    const r = applyDecisions(base, 'MAGNUM', [it1], [dec(7, null, 0.1, 'vegetables', 'Картофель 1 кг')])
    const c = r.dict.canonicals[canonicalKey(['MAGNUM:m_7'])]!
    expect(c.name).toBe('Картофель')
    expect(c.attributes).toEqual({})
    expect(r.stats.rejectedName).toBe(1)
  })
  it('accepts a displayName size when a non-weighted source has none', () => {
    const it1 = item(8, 'Соль', [], ['Бакалея'])
    const r = applyDecisions(base, 'MAGNUM', [it1], [dec(8, null, 0.1, 'milk', 'Соль 1 кг')])
    expect(r.dict.canonicals[canonicalKey(['MAGNUM:m_8'])]!.name).toBe('Соль 1 кг')
    expect(r.stats.rejectedName).toBe(0)
  })
  it('does not rename an existing card when attaching', () => {
    const r = applyDecisions(base, 'MAGNUM', [i1], [dec(1, 'c_milk1', 0.99, 'milk', 'Другое имя', 'Другой')])
    expect(r.dict.canonicals['c_milk1']).toEqual(base.canonicals['c_milk1'])
  })
  it('rejects a match outside the item candidates', () => {
    const r = applyDecisions(base, 'MAGNUM', [i1], [dec(1, 'c_soap', 0.99)])
    expect(r.dict.products['MAGNUM:m_1']).toBe(canonicalKey(['MAGNUM:m_1']))
    expect(r.stats.rejectedOutsideCandidates).toBe(1)
    expect(r.stats.created).toBe(1)
  })
  it('rejects a match with a different size', () => {
    const small = item(1, 'Молоко Лактель 2,5% 0,9 л', [cand('c_milk1')])
    const r = applyDecisions(base, 'MAGNUM', [small], [dec(1, 'c_milk1', 0.99)])
    expect(r.dict.products['MAGNUM:m_1']).not.toBe('c_milk1')
    expect(r.stats.rejectedSize).toBe(1)
  })
  it('never attaches two items of the same store to one canonical', () => {
    const i4 = item(4, 'Молоко Лактель 2,5% 1 литр', [cand('c_milk1')])
    const r = applyDecisions(base, 'MAGNUM', [i1, i4], [dec(1, 'c_milk1', 0.99), dec(4, 'c_milk1', 0.97)])
    expect(r.dict.products['MAGNUM:m_1']).toBe('c_milk1')
    expect(r.dict.products['MAGNUM:m_4']).not.toBe('c_milk1')
    expect(r.stats.sameStoreConflicts).toBe(1)
  })
  it('does not attach to a card that already holds a product of this store in the base', () => {
    const i5 = item(5, 'Молоко Простоквашино 2,5% 1 л', [cand('c_busy')])
    const r = applyDecisions(base, 'MAGNUM', [i5], [dec(5, 'c_busy', 0.99)])
    expect(r.dict.products['MAGNUM:m_5']).not.toBe('c_busy')
    expect(r.stats.sameStoreConflicts).toBe(1)
  })
  it('throws when a decision is missing', () => {
    const i2 = item(2, 'Молоко Лактель 2,5% 1 л', [cand('c_milk1')])
    expect(() => applyDecisions(base, 'MAGNUM', [i1, i2], [dec(1, 'c_milk1', 0.99)])).toThrow(/MAGNUM:m_2/)
  })
  it('throws on duplicate or unknown decisions', () => {
    expect(() => applyDecisions(base, 'MAGNUM', [i1], [dec(1, null, 0.1), dec(1, null, 0.1)])).toThrow(/MAGNUM:m_1/)
    expect(() => applyDecisions(base, 'MAGNUM', [i1], [dec(1, null, 0.1), dec(9, null, 0.1)])).toThrow(/MAGNUM:m_9/)
  })
  it('adds store categories by majority vote and never overwrites base keys', () => {
    const path = ['Молочные продукты', 'Молоко']
    const items = [item(1, 'Молоко А 1 л', [], path), item(2, 'Молоко Б 1 л', [], path), item(3, 'Молоко В 1 л', [], path), item(4, 'Что-то', [], ['Старая категория'])]
    const r = applyDecisions(base, 'MAGNUM', items, [dec(1, null, 0, 'milk'), dec(2, null, 0, 'milk'), dec(3, null, 0, 'dairy'), dec(4, null, 0, 'milk')])
    expect(r.dict.storeCategories[storeCategoryKey('MAGNUM', path)]).toBe('milk')
    expect(r.dict.storeCategories['MAGNUM|Старая категория']).toBe('dairy') // из base, голос milk проигнорирован
  })
})

describe('MatchDecisionSchema / validateDecisions', () => {
  it('accepts a valid decision and rejects a bad category or confidence', () => {
    expect(MatchDecisionSchema.safeParse(dec(1, null, 0.5)).success).toBe(true)
    expect(MatchDecisionSchema.safeParse(dec(1, null, 0.5, 'nonsense')).success).toBe(false)
    expect(MatchDecisionSchema.safeParse(dec(1, null, 1.5)).success).toBe(false)
  })
  it('reports missing, extra and malformed decisions', () => {
    const items = [item(1, 'a', []), item(2, 'b', [])]
    expect(validateDecisions(items, [dec(1, null, 0.1), dec(2, null, 0.1)])).toBeNull()
    expect(validateDecisions(items, [dec(1, null, 0.1)])).toMatch(/MAGNUM:m_2/)
    expect(validateDecisions(items, [dec(1, null, 0.1), dec(2, null, 0.1), dec(3, null, 0.1)])).toMatch(/MAGNUM:m_3/)
    expect(validateDecisions(items, 'oops')).toMatch(/array/)
  })
})
