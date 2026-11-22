import { describe, expect, it } from 'vitest'
import { isVariableWeight } from '../src/mapping/weight.js'
import type { StoreCode } from '../src/types.js'

describe('isVariableWeight', () => {
  it('MAGNUM is weighted only by the isWeighted payload flag', () => {
    expect(isVariableWeight('MAGNUM', { name: 'Картофель', rawPayload: { isWeighted: true, priceUnit: 'kg' } })).toBe(true)
    expect(isVariableWeight('MAGNUM', { name: 'Картофель', rawPayload: { isWeighted: false } })).toBe(false)
    expect(isVariableWeight('MAGNUM', { name: 'Картофель', rawPayload: {} })).toBe(false)
  })
  it('does not guess from the name or the price unit alone', () => {
    expect(isVariableWeight('MAGNUM', { name: 'Сыр вес', rawPayload: {} })).toBe(false)
    expect(isVariableWeight('MAGNUM', { name: 'Сыр', rawPayload: { priceUnit: 'kg' } })).toBe(false)
  })
  it('GRAMAD is weighted only by the isWeighted payload flag', () => {
    expect(isVariableWeight('GRAMAD', { name: 'Картофель', rawPayload: { isWeighted: true, priceUnit: 'kg' } })).toBe(true)
    expect(isVariableWeight('GRAMAD', { name: 'Картофель', rawPayload: {} })).toBe(false)
    expect(isVariableWeight('GRAMAD', { name: 'Картофель', rawPayload: { priceUnit: 'kg' } })).toBe(false)
    expect(isVariableWeight('GRAMAD', { name: 'КАРТОФЕЛЬ КГ', rawPayload: {} })).toBe(false)
  })
  it('other chains are never weighted, even with the flag', () => {
    expect(isVariableWeight('STORE_A' as StoreCode, { name: 'Картофель', rawPayload: { isWeighted: true, priceUnit: 'kg' } })).toBe(false)
  })
})
