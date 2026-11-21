import { describe, expect, it } from 'vitest'
import type { Cluster } from '../src/agent/match.js'
import { isolateForPublish } from '../src/mapping/publish.js'
import type { StoreCode } from '../src/types.js'
import { cp } from './helpers.js'

const a = cp('DINA', '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp('DANA', 'dana_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const c = cp('FIX_PRICE', 'fp_3', 'Молоко FM 3.2% 1000 мл', { volumeMl: 1000, fatPercent: 3.2 })

describe('isolateForPublish', () => {
  it('splits a pending multi-store cluster into singletons keeping metadata', () => {
    const out = isolateForPublish([{ members: [a, b, c], method: 'ai', confidence: 0.85, review: 'pending' }])
    expect(out).toHaveLength(3)
    out.forEach((cl, i) => {
      expect(cl.members).toHaveLength(1)
      expect(cl).toMatchObject({ method: 'ai', confidence: 0.85, review: 'pending' })
      expect(cl.members[0]).toBe([a, b, c][i])
    })
  })
  it('leaves approved clusters and singletons untouched', () => {
    const input: Cluster[] = [
      { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
      { members: [c], method: 'deterministic', confidence: 1, review: 'pending' },
    ]
    expect(isolateForPublish(input)).toEqual(input)
  })
})

const cucumberKg = cp('MAGNUM', '10', 'Огурцы', {}, null, 'огурцы', 'vegetables')
cucumberKg.product.rawPayload = { isWeighted: true, priceUnit: 'kg' }
const cucumberPiece = cp('STORE_A' as StoreCode, 'a_11', 'Огурцы 1 шт', {}, null, 'огурцы', 'vegetables')
const cucumberKg2 = cp('MAGNUM', '12', 'Огурцы', {}, null, 'огурцы', 'vegetables')
cucumberKg2.product.rawPayload = { isWeighted: true, priceUnit: 'kg' }
const cucumberPiece2 = cp('STORE_B' as StoreCode, 'b_13', 'Огурцы 1 шт', {}, null, 'огурцы', 'vegetables')

describe('isolateForPublish weight guard', () => {
  it('weighted item in a group with a piece item becomes its own card', () => {
    const out = isolateForPublish([{ members: [cucumberKg, cucumberPiece], method: 'ai', confidence: 0.97, review: 'approved' }])
    expect(out.map((c) => c.members.map((m) => m.product.sourceProductId))).toEqual([['a_11'], ['10']])
    expect(out.every((c) => c.review === 'approved' && c.method === 'ai')).toBe(true)
  })
  it('two weighted items of the same chain stay together', () => {
    const input: Cluster[] = [{ members: [cucumberKg, cucumberKg2], method: 'ai', confidence: 0.97, review: 'approved' }]
    expect(isolateForPublish(input)).toEqual(input)
  })
  it('several piece items stay together while the weighted one is split off', () => {
    const out = isolateForPublish([{ members: [cucumberKg, cucumberPiece, cucumberPiece2], method: 'ai', confidence: 0.97, review: 'approved' }])
    expect(out.map((c) => c.members.length).sort()).toEqual([1, 2])
  })
})
