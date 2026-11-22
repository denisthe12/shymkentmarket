import { describe, expect, it } from 'vitest'
import { extractFat, extractSize, normalizeText } from '../src/agent/units.js'

describe('units', () => {
  it.each([
    ['Молоко FoodMaster 3,2% 1 л', { volumeMl: 1000 }],
    ['Молоко 0,5л', { volumeMl: 500 }],
    ['Масло подсолнечное 900 мл', { volumeMl: 900 }],
    ['Сахар 1кг', { weightGrams: 1000 }],
    ['Крупа манная 700 г', { weightGrams: 700 }],
    ['Яйцо С1 10 шт', { packageCount: 10 }],
    ['Вода 6х1.5 л', { volumeMl: 1500, packageCount: 6 }],
    ['Хлеб Бородинский', {}],
    ['Сахар Чайкофский порционный в стиках 0.3 г 10 шт', { packageCount: 10 }],
    ['Сметана 18% жирности 0.380г', {}],
    ['Соль 4Life крупная йодированная морская 1 кг', { weightGrams: 1000 }],
    ['Соль 4Life гималайская розовая пищевая крупная 500 гр', { weightGrams: 500 }],
    ['Вода 1 л', { volumeMl: 1000 }],
    ['Вода 1l', { volumeMl: 1000 }],
    ['Вода 1 литр', { volumeMl: 1000 }],
    ['Вода 0,5 л', { volumeMl: 500 }],
    ['Вода 1.5L', { volumeMl: 1500 }],
    ['Сыр 5gold 200 г', { weightGrams: 200 }],
    ['Печенье 300g', { weightGrams: 300 }],
  ])('%s', (name, size) => expect(extractSize(name)).toEqual(size))
  it('never yields a zero size after integer normalization', () => {
    expect(extractSize('Сахар порционный 0.3 г 10 шт')).not.toHaveProperty('weightGrams')
    expect(extractSize('Сироп 0.4 мл')).not.toHaveProperty('volumeMl')
  })
  it('fat percent with comma decimals', () => {
    expect(extractFat('Кефир 2,5%')).toBe(2.5)
    expect(extractFat('Сок 100%')).toBeNull()
  })
  it('ignores composition percentages that are not fat', () => {
    expect(extractFat('Говядина суп набор 10% мяса 90% кости')).toBeNull()
    expect(extractFat('Шоколад горький 70% какао 100 г')).toBeNull()
    expect(extractFat('Сметана 20% жирности 300 г')).toBe(20)
    expect(extractFat('Масло сливочное 82,5% 180 г')).toBe(82.5)
  })
  it('normalizes ё, quotes and spaces', () => {
    expect(normalizeText('  Сахар «ЛИДЕР»  ёлка ')).toBe('сахар лидер елка')
  })
})
