import { describe, expect, it } from 'vitest'
import type { CategorySlug } from '../src/agent/taxonomy.js'
import { refineMeat } from '../src/mapping/meat.js'
import { refineCategory } from '../src/mapping/milk.js'

// Сырая баранина и конина Dina лежат в разделах «Готовая еда» (→ other) и «Полуфабрикаты» (→ frozen); СЗПТ фаза 3
const cases: [CategorySlug, string, CategorySlug][] = [
  ['other', 'Баранина Задок', 'meat'],
  ['other', 'Баранина Шейная часть', 'meat'],
  ['frozen', 'п/ф конина жая охл', 'meat'],
  ['frozen', 'п/ф конина тибон на кости охл', 'meat'],
  ['frozen', 'п/ф конина соленая охл', 'meat'], // мясная категория; из группы «Конина» исключит Go-правило
  ['other', 'Баранина тушеная Кублей 325 г', 'other'],
  ['frozen', 'П/ф Конина Кублей Казы вес', 'frozen'],
  ['frozen', 'Полуфабрикат люля-кебаб Кублей баранины 0,45кг', 'frozen'],
  ['canned', 'Конина тушеная Кублей 325 г', 'canned'],
  ['sausages', 'Колбаса Рамай Гриль с Бараниной 600г', 'sausages'],
  ['dairy', 'Конина сыр', 'dairy'],
  ['other', 'Баранина шашлык маринованный', 'other'],
  ['frozen', 'Конина пельмени 500 г', 'frozen'],
  ['other', 'Баранинаподобный продукт', 'other'],
]

describe('refineMeat', () => {
  it.each(cases)('%s «%s» → %s', (category, name, expected) => {
    expect(refineMeat(category, name)).toBe(expected)
  })
  it('refineCategory applies the meat rule', () => {
    expect(refineCategory('other', 'Баранина Ребро')).toBe('meat')
    expect(refineCategory('frozen', 'П/Ф КОНИНА ЖАЯ ОХЛ')).toBe('meat')
  })
})
