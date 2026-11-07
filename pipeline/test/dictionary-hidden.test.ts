import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readDictionary } from '../src/mapping/dictionary.js'
import { readOverrides } from '../src/mapping/overrides.js'
import { publishCategories } from '../src/mapping/scope.js'
import { buildSyncBundle } from '../src/sync/sync.js'
import type { SourceFile } from '../src/types.js'

const mapping = (file: string) => fileURLToPath(new URL(`../../data/mapping/${file}`, import.meta.url))
const dict = readDictionary(mapping('dictionary.json'))
const overrides = readOverrides(mapping('overrides.json'))

const KEY = 'c_1f576b2844c493c7'
const source = (storeCode: SourceFile['storeCode'], sourceProductId: string, name: string, price: number): SourceFile => ({
  storeCode, city: 'Aktau', capturedAt: '2026-11-07T01:00:00.000Z', errorCount: 0, sourceStats: {},
  products: [{ sourceProductId, name, price, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null, sourceCategoryPath: [], rawPayload: {} }],
})
const files = [source('DANA', 'dana_18621', 'СОЧНИ С ТВОРОГОМ ШТ', 1009), source('ANVAR', 'anvar_668903', 'Сочни с творогом СП', 199)]

describe('скрытая карточка «Сочни с творогом»', () => {
  it('не попадает в публикацию и в список новых товаров', () => {
    expect(dict.canonicals[KEY]!.category).toBe('other')
    expect(publishCategories().has('other')).toBe(false)
    const { bundle, unmapped } = buildSyncBundle(files, dict, '2026-11-07T01:00:00.000Z', publishCategories())
    expect(bundle.canonicalProducts).toHaveLength(0)
    expect(bundle.rawProducts).toHaveLength(0)
    expect(unmapped).toHaveLength(0)
  })

  it('оба товара остаются в словаре, скрытие записано в overrides', () => {
    expect(dict.products['DANA:dana_18621']).toBe(KEY)
    expect(dict.products['ANVAR:anvar_668903']).toBe(KEY)
    expect(overrides.moveCategory).toContainEqual(expect.objectContaining({ key: KEY, to: 'other' }))
  })
})
