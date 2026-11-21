import { describe, expect, it } from 'vitest'
import type { Bundle, BundleRaw } from '../src/agent/bundle.js'
import { compareBundles } from '../src/sync/compare.js'
import type { StoreCode } from '../src/types.js'
import { STORE_A, STORE_B, STORE_C } from './helpers.js'

const raw = (storeCode: StoreCode, id: string, price = 500): BundleRaw => ({
  storeCode, sourceProductId: id, sourceUrl: null, name: `Товар ${id}`, brand: null, category: null, price, oldPrice: null, imageUrl: null, rawPayload: {},
})
const bundleOf = (rawProducts: BundleRaw[]): Bundle => ({ version: '1.0', generatedAt: '2026-10-13T00:00:00.000Z', rawProducts, canonicalProducts: [], sourceRuns: [] })
const many = (n: number) => Array.from({ length: n }, (_, i) => raw(i % 2 === 0 ? STORE_B : STORE_A, `p${i}`))

describe('compareBundles', () => {
  it('одинаковые bundle: нулевое расхождение и пустые списки', () => {
    const d = compareBundles(bundleOf(many(10)), bundleOf(many(10)))
    expect(d.mismatchRatio).toBe(0)
    expect(d.onlyA).toEqual([])
    expect(d.onlyB).toEqual([])
    expect(d.priceChanged).toEqual([])
    expect(d.a).toBe(10)
    expect(d.b).toBe(10)
  })

  it('товара из A нет в B: попадает в onlyA, ratio 1/200', () => {
    const items = [...many(199), raw(STORE_B, 'x')]
    const d = compareBundles(bundleOf(items), bundleOf(items.filter((r) => r.sourceProductId !== 'x')))
    expect(d.onlyA).toEqual(['STORE_B:x'])
    expect(d.onlyB).toEqual([])
    expect(d.mismatchRatio).toBe(0.005)
  })

  it('товар только в B: попадает в onlyB и тоже считается расхождением', () => {
    const d = compareBundles(bundleOf(many(100)), bundleOf([...many(100), raw('MAGNUM', 'y')]))
    expect(d.onlyB).toEqual(['MAGNUM:y'])
    expect(d.mismatchRatio).toBe(0.01)
  })

  it('изменение цены попадает в priceChanged и не влияет на mismatchRatio', () => {
    const a = bundleOf([raw(STORE_B, '1', 500), raw(STORE_A, '2')])
    const b = bundleOf([raw(STORE_B, '1', 520), raw(STORE_A, '2')])
    const d = compareBundles(a, b)
    expect(d.priceChanged).toEqual([{ id: 'STORE_B:1', a: 500, b: 520 }])
    expect(d.mismatchRatio).toBe(0)
  })

  it('идентичность включает сеть: один sourceProductId в разных сетях - разные товары', () => {
    const d = compareBundles(bundleOf([raw(STORE_B, '1')]), bundleOf([raw(STORE_A, '1')]))
    expect(d.onlyA).toEqual(['STORE_B:1'])
    expect(d.onlyB).toEqual(['STORE_A:1'])
  })

  it('perStore считает товары по сетям', () => {
    const a = bundleOf([raw(STORE_B, '1'), raw(STORE_B, '2'), raw(STORE_A, '3')])
    const b = bundleOf([raw(STORE_B, '1'), raw(STORE_C, '4')])
    const d = compareBundles(a, b)
    expect(d.perStore).toEqual({ STORE_B: { a: 2, b: 1 }, STORE_A: { a: 1, b: 0 }, STORE_C: { a: 0, b: 1 } })
  })

  it('пустой A не даёт деления на ноль', () => {
    const d = compareBundles(bundleOf([]), bundleOf([raw(STORE_B, '1')]))
    expect(d.mismatchRatio).toBe(1)
  })
})
