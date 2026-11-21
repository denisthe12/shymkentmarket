import { describe, expect, it } from 'vitest'
import { applyGuards } from '../src/agent/match.js'
import { cp } from './helpers.js'

const a = cp('STORE_A', '1', 'Молоко FoodMaster 2.5% 1 л', { volumeMl: 1000, fatPercent: 2.5 })
const b = cp('STORE_B', '2', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const c = cp('MAGNUM', '3', 'Молоко Фудмастер 2,5% 1л', { volumeMl: 1000, fatPercent: 2.5 })
const d = cp('STORE_A', '4', 'Молоко FoodMaster 2.5% 1 л ультрапаст', { volumeMl: 1000, fatPercent: 2.5 })

describe('cluster guards', () => {
  it('guard splits different fat', () => {
    expect(applyGuards({ members: [a, b], method: 'ai', confidence: 0.99, review: 'approved' })).toHaveLength(2)
  })
  it('guard never merges same store', () => {
    const out = applyGuards({ members: [a, d, c], method: 'ai', confidence: 0.99, review: 'approved' })
    expect(out.every((cl) => new Set(cl.members.map((m) => m.storeCode)).size === cl.members.length)).toBe(true)
    expect(out.flatMap((cl) => cl.members)).toHaveLength(3)
  })
})
