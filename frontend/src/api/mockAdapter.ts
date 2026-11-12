import { mockCategories, mockDashboard, mockFilters, mockProducts, mockSzptGroups, mockSzptProducts } from '../mocks'
import {
  ApiError,
  type CatalogApi,
  type ProductCardDto,
  type ProductQuery,
  type SzptProductDto,
  type SzptQuery,
  type SzptUnit,
} from './types'

type MockOptions = {
  /** Искусственная задержка, чтобы видеть loading-состояния */
  delayMs?: number
}

export function createMockAdapter({ delayMs = 250 }: MockOptions = {}): CatalogApi {
  const respond = <T>(data: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), delayMs))

  const fail = (status: number, message: string): Promise<never> =>
    new Promise((_, reject) => setTimeout(() => reject(new ApiError(status, message)), delayMs))

  return {
    getCategories: () => respond(mockCategories),

    getCategoryFilters: (slug) => {
      const schema = mockFilters[slug]
      return schema ? respond(schema) : fail(404, `Category "${slug}" not found`)
    },

    getProducts: (query) => {
      const offset = query.offset ?? 0
      const matched = queryProducts(mockProducts, query)
      return respond(query.limit === undefined ? matched.slice(offset) : matched.slice(offset, offset + query.limit))
    },

    getProduct: (id) => {
      const product = mockProducts.find((p) => p.id === id)
      return product ? respond(product) : fail(404, `Product "${id}" not found`)
    },

    getDashboard: () => respond(mockDashboard),

    getSzptGroups: () => respond(mockSzptGroups),

    getSzptProducts: (query) => {
      const group = mockSzptGroups.find((g) => g.slug === query.group)
      if (!group) return fail(404, `SZPT group "${query.group}" not found`)
      const offset = query.offset ?? 0
      const matched = querySzpt(mockSzptProducts[group.slug] ?? [], group.unit, query)
      return respond(query.limit === undefined ? matched.slice(offset) : matched.slice(offset, offset + query.limit))
    },
  }
}

/** Фасовка товара в базовой единице группы — так её считает бэк (у молока и кефира граммы = мл) */
function packSize(product: SzptProductDto, unit: SzptUnit): unknown {
  const a = product.attributes
  if (unit === 'kg') return a.weightGrams
  if (unit === 'l') return a.volumeMl ?? a.weightGrams
  return a.packageCount
}

/** Фильтр фасовки и две сортировки СЗПТ, как на бэке: при равенстве — minPrice, затем id */
export function querySzpt(source: SzptProductDto[], unit: SzptUnit, query: SzptQuery): SzptProductDto[] {
  const sizes = query.sizes ?? []
  const unitValue = (p: SzptProductDto) => p.unitPrice?.value ?? Infinity
  return source
    .filter((p) => sizes.length === 0 || sizes.includes(packSize(p, unit) as number))
    .sort((a, b) =>
      (query.sort === 'unit_price_asc' ? unitValue(a) - unitValue(b) : 0) ||
      a.minPrice - b.minPrice ||
      a.id.localeCompare(b.id),
    )
}

/** Фильтрация и сортировка так, как их (по нашему предложению) делает бэк */
export function queryProducts(source: ProductCardDto[], query: ProductQuery): ProductCardDto[] {
  // Каждое слово запроса должно встретиться в названии или бренде, порядок не важен
  const words = (query.search ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const activeFilters = Object.entries(query.filters ?? {}).filter(([, values]) => values.length > 0)

  const result = source.filter((p) => {
    if (query.category && p.category.slug !== query.category) return false
    const text = `${p.name} ${p.brand ?? ''}`.toLowerCase()
    if (!words.every((word) => text.includes(word))) return false
    // Между значениями одного фильтра — OR, между фильтрами — AND
    return activeFilters.every(([key, values]) => values.includes(String(p.attributes[key])))
  })

  const collator = new Intl.Collator('ru')
  switch (query.sort ?? 'price_asc') {
    case 'price_asc':
      return result.sort((a, b) => a.minPrice - b.minPrice)
    case 'price_desc':
      return result.sort((a, b) => b.minPrice - a.minPrice)
    case 'name_asc':
      return result.sort((a, b) => collator.compare(a.name, b.name))
  }
}
