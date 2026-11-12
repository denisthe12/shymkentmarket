import { describe, expect, it } from 'vitest'
import { getI18n } from '../i18n'
import { formatPackSize, formatUnitPrice } from './szpt'

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
