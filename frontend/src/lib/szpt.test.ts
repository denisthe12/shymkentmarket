import { describe, expect, it } from 'vitest'
import { getI18n } from '../i18n'
import type { SzptGroupDto } from '../api/types'
import type { SzptProductDto } from '../api/types'
import { defaultSortOf, formatPackSize, formatUnitPrice, readSzptState, szptParams, toPerKgCard } from './szpt'

const t = getI18n('ru').t
const kk = getI18n('kk').t
const plain = (s: string) => s.replace(/\s/g, ' ')

describe('formatPackSize', () => {
  it('labels sizes in the group base unit', () => {
    expect(plain(formatPackSize(400, 'kg', t))).toBe('400 г')
    expect(plain(formatPackSize(1000, 'kg', t))).toBe('1 кг')
    expect(plain(formatPackSize(1950, 'l', t))).toBe('1,95 л')
    expect(plain(formatPackSize(900, 'l', t))).toBe('900 мл')
    expect(plain(formatPackSize(10, '10pcs', t))).toBe('10 шт')
  })
})

describe('formatUnitPrice', () => {
  it('rounds to whole tenge and names the unit', () => {
    expect(plain(formatUnitPrice({ value: 840, unit: 'kg' }, t))).toBe('840 ₸/кг')
    expect(plain(formatUnitPrice({ value: 531.11, unit: 'l' }, t))).toBe('531 ₸/л')
    expect(plain(formatUnitPrice({ value: 690, unit: '10pcs' }, t))).toBe('690 ₸/10 шт')
    expect(plain(formatUnitPrice({ value: 7600, unit: 'kg' }, t))).toBe('7 600 ₸/кг')
  })

  it('uses Kazakh unit names', () => {
    expect(plain(formatUnitPrice({ value: 690, unit: '10pcs' }, kk))).toBe('690 ₸/10 дана')
  })
})

const plainGroup: SzptGroupDto = { slug: 'rice', name: 'Рис', unit: 'kg', sizes: [800, 1000], count: 5 }
const weightedGroup: SzptGroupDto = { ...plainGroup, slug: 'apples', defaultSort: 'unit_price_asc' }

describe('szpt url state', () => {
  it('defaults the sort to the group default, price_asc for an old API', () => {
    expect(defaultSortOf(weightedGroup)).toBe('unit_price_asc')
    expect(defaultSortOf(plainGroup)).toBe('price_asc')
    expect(readSzptState(new URLSearchParams(''), weightedGroup).sort).toBe('unit_price_asc')
    expect(readSzptState(new URLSearchParams(''), plainGroup).sort).toBe('price_asc')
  })

  it('lets ?sort= override the group default and ignores unknown values', () => {
    expect(readSzptState(new URLSearchParams('sort=price_asc'), weightedGroup).sort).toBe('price_asc')
    expect(readSzptState(new URLSearchParams('sort=unit_price_asc'), plainGroup).sort).toBe('unit_price_asc')
    expect(readSzptState(new URLSearchParams('sort=bogus'), weightedGroup).sort).toBe('unit_price_asc')
  })

  it('writes sort to the URL only when it differs from the group default', () => {
    expect(szptParams({ sizes: [], sort: 'price_asc' }, weightedGroup).toString()).toBe('sort=price_asc')
    expect(szptParams({ sizes: [], sort: 'unit_price_asc' }, weightedGroup).toString()).toBe('')
    expect(szptParams({ sizes: [], sort: 'price_asc' }, plainGroup).toString()).toBe('')
    expect(szptParams({ sizes: [800], sort: 'unit_price_asc' }, plainGroup).toString()).toBe('size=800&sort=unit_price_asc')
  })
})

describe('toPerKgCard', () => {
  const weighted: SzptProductDto = {
    id: 'w1',
    name: 'Картофель',
    brand: null,
    category: { slug: 'vegetables', name: 'Овощи' },
    imageUrl: null,
    attributes: {},
    minPrice: 1480,
    unitPrice: { value: 822.22, unit: 'kg' },
    soldByWeight: true,
    offers: [
      { storeCode: 'DINA', storeName: 'Dina', price: 1480, oldPrice: 1600, unitPrice: { value: 822.22, unit: 'kg' }, soldByWeight: true },
      { storeCode: 'ANVAR', storeName: 'Анвар', price: 299, oldPrice: null, unitPrice: { value: 299, unit: 'kg' }, soldByWeight: true },
    ],
    snapshotAt: '2026-11-11T01:00:51.947Z',
  }

  it('replaces package prices with per-kg prices and scales the old price', () => {
    const card = toPerKgCard(weighted)
    expect(card.offers.map((o) => [o.price, o.oldPrice])).toEqual([[822, 889], [299, null]])
    expect(card.minPrice).toBe(299)
  })

  it('keeps an offer without a unit price as is', () => {
    const card = toPerKgCard({ ...weighted, offers: [{ ...weighted.offers[0], unitPrice: null }] })
    expect(card.offers[0].price).toBe(1480)
  })
})

describe('szpt.subtitle', () => {
  it('declines the group count in ru and has a kk text', () => {
    expect([1, 2, 5, 25].map((count) => t('szpt.subtitle', { count }))).toEqual([
      '1 группа продуктов из перечня СЗПТ (приказ МТИ РК № 362-нқ).',
      '2 группы продуктов из перечня СЗПТ (приказ МТИ РК № 362-нқ).',
      '5 групп продуктов из перечня СЗПТ (приказ МТИ РК № 362-нқ).',
      '25 групп продуктов из перечня СЗПТ (приказ МТИ РК № 362-нқ).',
    ])
    expect(kk('szpt.subtitle', { count: 25 })).toBe('ӘМАТ тізімінен 25 өнім тобы (ҚР СИМ № 362-нқ бұйрығы).')
  })
})
