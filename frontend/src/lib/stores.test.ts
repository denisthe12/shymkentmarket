import { describe, expect, it } from 'vitest'
import type { StoreLocationDto } from '../api/types'
import { groupByStore, locationKey, storeColor } from './stores'

const point = (storeCode: string, address: string): StoreLocationDto => ({
  storeCode,
  storeName: storeCode,
  name: storeCode,
  address,
  latitude: 43.6,
  longitude: 51.1,
})

describe('stores', () => {
  it('groups points by chain in order of first appearance', () => {
    const groups = groupByStore([point('STORE_A', 'a'), point('MAGNUM', 'b'), point('STORE_A', 'c')])
    expect(groups.map((g) => [g.storeCode, g.locations.map((l) => l.address)])).toEqual([
      ['STORE_A', ['a', 'c']],
      ['MAGNUM', ['b']],
    ])
  })

  it('gives Magnum its own non-green color and every other chain a neutral gray', () => {
    const magnum = storeColor('MAGNUM')
    expect(magnum).not.toBe('#697178')
    // зелёный в UI значит «здесь дешевле»: канал G не должен доминировать
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(magnum.slice(i, i + 2), 16))
    expect(g > r && g > b).toBe(false)
    expect(storeColor('STORE_X')).toBe('#697178')
  })

  it('builds the marker key from chain and address', () => {
    expect(locationKey(point('DINA', '5-й микрорайон, 30'))).toBe('DINA:5-й микрорайон, 30')
  })
})
