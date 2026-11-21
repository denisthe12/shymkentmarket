import { describe, expect, it } from 'vitest'
import type { BasketDto, StoreCode } from '../api/types'
import { summarizeBaskets } from './baskets'

function basket(storeCode: StoreCode, prices: (number | null)[]): BasketDto {
  return {
    storeCode,
    storeName: storeCode,
    total: prices.reduce<number>((sum, p) => sum + (p ?? 0), 0),
    items: prices.map((price, i) => ({
      categorySlug: `c${i}`,
      categoryName: `C${i}`,
      productId: price === null ? null : `p${i}`,
      name: price === null ? null : `P${i}`,
      price,
    })),
  }
}

describe('summarizeBaskets', () => {
  it('marks the cheapest complete basket and the difference for the rest', () => {
    const result = summarizeBaskets([basket('STORE_A', [300, 400]), basket('MAGNUM', [200, 300])])
    expect(result.map((b) => [b.storeCode, b.best, b.overBest])).toEqual([
      ['MAGNUM', true, null],
      ['STORE_A', false, 200],
    ])
  })

  it('never picks an incomplete basket as the best and puts it last', () => {
    const result = summarizeBaskets([basket('STORE_B', [100, null]), basket('STORE_A', [300, 400]), basket('MAGNUM', [200, 300])])
    expect(result.map((b) => [b.storeCode, b.missing, b.best, b.overBest])).toEqual([
      ['MAGNUM', 0, true, null],
      ['STORE_A', 0, false, 200],
      ['STORE_B', 1, false, null],
    ])
  })

  it('puts a basket with nothing found after the incomplete ones', () => {
    // Как MAGNUM на реальных данных: все позиции null, total = 0
    const result = summarizeBaskets([basket('MAGNUM', [null, null, null]), basket('STORE_A', [700, null, 900]), basket('STORE_B', [650, 580, 820])])
    expect(result.map((b) => [b.storeCode, b.empty, b.best])).toEqual([
      ['STORE_B', false, true],
      ['STORE_A', false, false],
      ['MAGNUM', true, false],
    ])
  })

  it('has no best basket when all are incomplete', () => {
    const result = summarizeBaskets([basket('MAGNUM', [null, 100]), basket('STORE_A', [50, null])])
    expect(result.every((b) => !b.best && b.overBest === null)).toBe(true)
  })
})
