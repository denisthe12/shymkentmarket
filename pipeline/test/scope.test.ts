import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLISH_CATEGORIES, filterClustersByScope, publishCategories } from '../src/mapping/scope.js'
import { cp, STORE_A, STORE_B } from './helpers.js'

describe('publish scope', () => {
  it('defaults to socially significant food categories only', () => {
    const scope = publishCategories(undefined)
    for (const slug of ['milk', 'dairy', 'eggs', 'bread', 'meat', 'vegetables', 'groats', 'sugar', 'oil']) expect(scope.has(slug as never)).toBe(true)
    for (const slug of ['hygiene', 'home', 'household', 'sweets', 'other', 'baby']) expect(scope.has(slug as never)).toBe(false)
    expect(scope.size).toBe(DEFAULT_PUBLISH_CATEGORIES.length)
  })
  it('can be overridden by a comma separated list, unknown slugs are rejected', () => {
    expect([...publishCategories('milk, bread')].sort()).toEqual(['bread', 'milk'])
    expect(() => publishCategories('milk,spaceships')).toThrow(/spaceships/)
  })
  it('drops clusters outside the scope and keeps the rest untouched', () => {
    const milk = cp(STORE_B, '1', 'Молоко 1 л', { volumeMl: 1000 })
    const sugar = cp(STORE_A, '2', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
    const soap = cp(STORE_B, '3', 'Мыло', {}, null, 'мыло', 'hygiene')
    const clusters = [milk, sugar, soap].map((m) => ({ members: [m], method: 'deterministic' as const, confidence: 1, review: 'approved' as const }))
    const kept = filterClustersByScope(clusters, publishCategories(undefined))
    expect(kept.map((c) => c.members[0]!.product.sourceProductId)).toEqual(['1', '2'])
  })
})
