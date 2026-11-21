// Генерирует фикстуры в src/mocks/ по подтверждённому контракту
// (docs/context/05_FRONTEND_ANSWERS_FROM_BACKEND_1.md). Опциональные поля
// (inStock, location.id, доп. поля priceSpreads) намеренно не генерируем —
// UI не должен от них зависеть.
// Запуск: node scripts/generate-mocks.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mocks')
const SNAPSHOT_AT = '2026-09-24T00:00:00.000Z'

const STORES = {
  MAGNUM: 'Magnum',
  STORE_A: 'Store A',
  STORE_B: 'Store B',
}

const categories = [
  { id: 'c0a1f000-0000-4000-8000-000000000001', slug: 'milk', name: 'Молоко' },
  { id: 'c0a1f000-0000-4000-8000-000000000002', slug: 'bread', name: 'Хлеб' },
  { id: 'c0a1f000-0000-4000-8000-000000000003', slug: 'eggs', name: 'Яйца' },
  { id: 'c0a1f000-0000-4000-8000-000000000004', slug: 'sugar', name: 'Сахар' },
  { id: 'c0a1f000-0000-4000-8000-000000000005', slug: 'oil', name: 'Масло растительное' },
]

// options — примитивные значения; подписи и единицы собирает фронт по ключу
const filters = {
  milk: [
    { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 900, 1000, 2000] },
    { key: 'fatPercent', label: 'Жирность', type: 'multi-select', options: [1, 2.5, 3.2, 6] },
    { key: 'lactoseFree', label: 'Без лактозы', type: 'boolean' },
  ],
  bread: [
    { key: 'weightGrams', label: 'Вес', type: 'multi-select', options: [300, 450, 600] },
    { key: 'breadType', label: 'Вид', type: 'multi-select', options: ['Пшеничный', 'Ржаной', 'Бородинский'] },
    { key: 'sliced', label: 'Нарезанный', type: 'boolean' },
  ],
  eggs: [
    { key: 'count', label: 'Количество', type: 'multi-select', options: [10, 20, 30] },
    { key: 'grade', label: 'Категория', type: 'multi-select', options: ['C0', 'C1', 'C2'] },
  ],
  sugar: [
    { key: 'weightGrams', label: 'Вес', type: 'multi-select', options: [1000, 2000, 5000] },
    { key: 'form', label: 'Вид', type: 'multi-select', options: ['Песок', 'Рафинад'] },
  ],
  oil: [
    { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 1000, 3000, 5000] },
    { key: 'oilType', label: 'Вид', type: 'multi-select', options: ['Подсолнечное', 'Оливковое'] },
    { key: 'refined', label: 'Рафинированное', type: 'boolean' },
  ],
}

// [name, brand, attributes, базовая цена, магазины, скидка у первого магазина]
const raw = {
  milk: [
    ['Молоко FoodMaster 3,2% 1 л', 'FoodMaster', { volumeMl: 1000, fatPercent: 3.2, lactoseFree: false }, 570, ['MAGNUM', 'STORE_A', 'STORE_B'], true],
    ['Молоко FoodMaster 2,5% 1 л', 'FoodMaster', { volumeMl: 1000, fatPercent: 2.5, lactoseFree: false }, 545, ['MAGNUM', 'STORE_A', 'STORE_B']],
    ['Молоко FoodMaster 6% 1 л', 'FoodMaster', { volumeMl: 1000, fatPercent: 6, lactoseFree: false }, 690, ['MAGNUM', 'STORE_A']],
    ['Молоко Lactel 3,2% 900 мл', 'Lactel', { volumeMl: 900, fatPercent: 3.2, lactoseFree: false }, 620, ['STORE_A', 'MAGNUM']],
    ['Молоко Lactel безлактозное 1% 900 мл', 'Lactel', { volumeMl: 900, fatPercent: 1, lactoseFree: true }, 880, ['STORE_A', 'MAGNUM', 'STORE_B']],
    ['Молоко Адал 2,5% 1 л', 'Адал', { volumeMl: 1000, fatPercent: 2.5, lactoseFree: false }, 510, ['MAGNUM', 'STORE_A', 'STORE_B'], true],
    ['Молоко Адал 3,2% 2 л', 'Адал', { volumeMl: 2000, fatPercent: 3.2, lactoseFree: false }, 980, ['MAGNUM', 'STORE_A']],
    ['Молоко Emil 1% 500 мл', 'Emil', { volumeMl: 500, fatPercent: 1, lactoseFree: false }, 290, ['STORE_B', 'MAGNUM']],
    ['Молоко Emil 3,2% 500 мл', 'Emil', { volumeMl: 500, fatPercent: 3.2, lactoseFree: false }, 320, ['STORE_B']],
    ['Молоко Моё 2,5% 900 мл', 'Моё', { volumeMl: 900, fatPercent: 2.5, lactoseFree: false }, 560, ['STORE_A', 'STORE_B']],
  ],
  bread: [
    ['Хлеб пшеничный формовой 450 г', 'Актау нан', { weightGrams: 450, breadType: 'Пшеничный', sliced: false }, 150, ['MAGNUM', 'STORE_A', 'STORE_B']],
    ['Хлеб пшеничный нарезной 450 г', 'Актау нан', { weightGrams: 450, breadType: 'Пшеничный', sliced: true }, 175, ['MAGNUM', 'STORE_A']],
    ['Хлеб ржаной 300 г', 'Каспий нан', { weightGrams: 300, breadType: 'Ржаной', sliced: false }, 190, ['STORE_A', 'MAGNUM']],
    ['Хлеб Бородинский нарезка 300 г', 'Каспий нан', { weightGrams: 300, breadType: 'Бородинский', sliced: true }, 260, ['STORE_A', 'MAGNUM', 'STORE_B'], true],
    ['Батон нарезной 600 г', 'Актау нан', { weightGrams: 600, breadType: 'Пшеничный', sliced: true }, 230, ['MAGNUM', 'STORE_B']],
    ['Хлеб ржано-пшеничный 600 г', 'Мангистау нан', { weightGrams: 600, breadType: 'Ржаной', sliced: false }, 240, ['MAGNUM']],
  ],
  eggs: [
    ['Яйца куриные С1 10 шт', 'Айс', { count: 10, grade: 'C1' }, 620, ['MAGNUM', 'STORE_A', 'STORE_B']],
    ['Яйца куриные С0 10 шт', 'Айс', { count: 10, grade: 'C0' }, 720, ['MAGNUM', 'STORE_A']],
    ['Яйца куриные С2 30 шт', 'Жас Канат', { count: 30, grade: 'C2' }, 1590, ['STORE_A', 'MAGNUM'], true],
    ['Яйца куриные С1 20 шт', 'Жас Канат', { count: 20, grade: 'C1' }, 1190, ['MAGNUM', 'STORE_B']],
    ['Яйца куриные С0 30 шт', 'Айс', { count: 30, grade: 'C0' }, 2150, ['STORE_A']],
  ],
  sugar: [
    ['Сахар-песок 1 кг', 'Коксу', { weightGrams: 1000, form: 'Песок' }, 480, ['MAGNUM', 'STORE_A', 'STORE_B']],
    ['Сахар-песок 5 кг', 'Коксу', { weightGrams: 5000, form: 'Песок' }, 2250, ['MAGNUM', 'STORE_A'], true],
    ['Сахар-песок 2 кг', 'Тараз', { weightGrams: 2000, form: 'Песок' }, 930, ['STORE_A', 'STORE_B']],
    ['Сахар рафинад 1 кг', 'Тараз', { weightGrams: 1000, form: 'Рафинад' }, 690, ['MAGNUM', 'STORE_A', 'STORE_B']],
  ],
  oil: [
    ['Масло подсолнечное рафинированное Шедевр 1 л', 'Шедевр', { volumeMl: 1000, oilType: 'Подсолнечное', refined: true }, 890, ['MAGNUM', 'STORE_A', 'STORE_B'], true],
    ['Масло подсолнечное рафинированное Шедевр 5 л', 'Шедевр', { volumeMl: 5000, oilType: 'Подсолнечное', refined: true }, 4150, ['MAGNUM', 'STORE_A']],
    ['Масло подсолнечное нерафинированное Алтын 1 л', 'Алтын', { volumeMl: 1000, oilType: 'Подсолнечное', refined: false }, 820, ['STORE_A', 'MAGNUM']],
    ['Масло подсолнечное Алтын 3 л', 'Алтын', { volumeMl: 3000, oilType: 'Подсолнечное', refined: true }, 2390, ['MAGNUM', 'STORE_B']],
    ['Масло оливковое Borges Extra Virgin 500 мл', 'Borges', { volumeMl: 500, oilType: 'Оливковое', refined: false }, 3490, ['STORE_A', 'MAGNUM', 'STORE_B']],
  ],
}

// Детерминированные наценки: разброс цен между сетями 3–30%
const markups = [0, 0.06, 0.13, 0.21, 0.09, 0.17, 0.04, 0.28]
const round10 = (n) => Math.round(n / 10) * 10

let seq = 0
const products = []
for (const [slug, items] of Object.entries(raw)) {
  const category = categories.find((c) => c.slug === slug)
  for (const [name, brand, attributes, base, stores, discounted] of items) {
    seq += 1
    const id = `p0a1f000-0000-4000-8000-${String(seq).padStart(12, '0')}`
    const offers = stores
      .map((storeCode, i) => {
        const price = i === 0 ? base : round10(base * (1 + markups[(seq + i) % markups.length] + i * 0.03))
        return {
          storeCode,
          storeName: STORES[storeCode],
          price,
          oldPrice: i === 0 && discounted ? round10(price * 1.15) : null,
        }
      })
      .sort((a, b) => a.price - b.price)
    products.push({
      id,
      name,
      brand,
      category: { slug: category.slug, name: category.name },
      // Картинок в моках нет — проверяем fallback. Одна битая ссылка — для проверки onError.
      imageUrl: seq === 3 ? 'https://example.invalid/broken.jpg' : null,
      attributes,
      minPrice: offers[0].price,
      offers,
      snapshotAt: SNAPSHOT_AT,
    })
  }
}

const priceSpreads = products
  .filter((p) => p.offers.length > 1)
  .map((p) => {
    const min = p.offers[0]
    const max = p.offers[p.offers.length - 1]
    return {
      productId: p.id,
      name: p.name,
      minPrice: min.price,
      maxPrice: max.price,
      differencePercent: Math.round(((max.price - min.price) / min.price) * 1000) / 10,
    }
  })
  .sort((a, b) => b.differencePercent - a.differencePercent)
  .slice(0, 10)

// Демонстрационные точки: адреса и координаты синтетические, не реальные магазины.
const locations = [
  ['MAGNUM', 'Magnum — демо-точка 1', 'Демонстрационный адрес 1', 42.3215, 69.5903],
  ['MAGNUM', 'Magnum — демо-точка 2', 'Демонстрационный адрес 2', 42.3303, 69.5745],
  ['MAGNUM', 'Magnum — демо-точка 3', 'Демонстрационный адрес 3', 42.3462, 69.6061],
  ['STORE_A', 'Store A — демо-точка 1', 'Демонстрационный адрес 4', 42.3141, 69.6052],
  ['STORE_A', 'Store A — демо-точка 2', 'Демонстрационный адрес 5', 42.3312, 69.5839],
  ['STORE_A', 'Store A — демо-точка 3', 'Демонстрационный адрес 6', 42.3558, 69.5702],
  ['STORE_B', 'Store B — демо-точка 1', 'Демонстрационный адрес 7', 42.3108, 69.5681],
  ['STORE_B', 'Store B — демо-точка 2', 'Демонстрационный адрес 8', 42.3287, 69.6002],
].map(([storeCode, name, address, latitude, longitude]) => ({
  storeCode,
  storeName: STORES[storeCode],
  name,
  address,
  latitude,
  longitude,
}))

// Продуктовая корзина: в каждой позиции — самый дешёвый подходящий товар сети.
// Состав в проде задаёт бэк (docs/context/07_FRONTEND_QUESTIONS_BASKET.md).
// Яйца C0 есть не во всех сетях — у Store B корзина неполная, проверяем этот случай.
const basketRules = [
  ['milk', (a) => a.volumeMl === 1000],
  ['bread', () => true],
  ['eggs', (a) => a.count === 10 && a.grade === 'C0'],
  ['sugar', (a) => a.weightGrams === 1000],
  ['oil', (a) => a.volumeMl === 1000],
]

const baskets = Object.entries(STORES).map(([storeCode, storeName]) => {
  const items = basketRules.map(([slug, fits]) => {
    const category = categories.find((c) => c.slug === slug)
    const best = products
      .filter((p) => p.category.slug === slug && fits(p.attributes))
      .flatMap((p) => p.offers.filter((o) => o.storeCode === storeCode).map((o) => ({ product: p, price: o.price })))
      .sort((a, b) => a.price - b.price)[0]
    return {
      categorySlug: slug,
      categoryName: category.name,
      productId: best?.product.id ?? null,
      name: best?.product.name ?? null,
      price: best?.price ?? null,
    }
  })
  return { storeCode, storeName, total: items.reduce((sum, i) => sum + (i.price ?? 0), 0), items }
})

const dashboard = {
  summary: {
    canonicalProducts: products.length,
    stores: Object.keys(STORES).length,
    matchedAcrossStores: products.filter((p) => p.offers.length > 1).length,
    snapshotAt: SNAPSHOT_AT,
  },
  priceSpreads,
  locations,
  baskets,
}

const write = (file, data) => writeFileSync(join(outDir, file), JSON.stringify(data, null, 2) + '\n')
mkdirSync(outDir, { recursive: true })
write('categories.json', categories)
write(
  'filters.json',
  Object.fromEntries(Object.entries(filters).map(([category, list]) => [category, { category, filters: list }])),
)
write('products.json', products)
write('dashboard.json', dashboard)
console.log(`mocks: ${categories.length} categories, ${products.length} products, ${locations.length} locations`)
