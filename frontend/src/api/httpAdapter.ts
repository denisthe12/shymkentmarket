import {
  ApiError,
  type CatalogApi,
  type CategoryDto,
  type DashboardDto,
  type FilterSchemaDto,
  type ProductCardDto,
  type ProductQuery,
  type SzptGroupDto,
  type SzptProductDto,
  type SzptQuery,
} from './types'

export function createHttpAdapter(baseUrl: string, isServer = false): CatalogApi {
  const root = baseUrl.replace(/\/+$/, '')

  async function get<T>(path: string, params?: URLSearchParams): Promise<T> {
    const qs = params && params.size > 0 ? `?${params}` : ''
    let response: Response
    try {
      response = await fetch(`${root}/api${path}${qs}`, {
        headers: { Accept: 'application/json' },
        ...(isServer ? { next: { revalidate: 3600, tags: ['catalog-data'] } } : {}),
      })
    } catch {
      throw new ApiError(0, 'Network error')
    }
    if (!response.ok) {
      // API v1 error envelope: { statusCode, message, error }
      const body = await response.json().catch(() => null)
      const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
      throw new ApiError(response.status, message ?? response.statusText)
    }
    return response.json() as Promise<T>
  }

  return {
    getCategories: () => get<CategoryDto[]>('/categories'),
    getCategoryFilters: (slug) => get<FilterSchemaDto>(`/categories/${encodeURIComponent(slug)}/filters`),
    getProducts: (query) => get<ProductCardDto[]>('/products', toSearchParams(query)),
    getProduct: (id) => get<ProductCardDto>(`/products/${encodeURIComponent(id)}`),
    getDashboard: () => get<DashboardDto>('/dashboard'),
    getSzptGroups: async () => (await get<{ groups: SzptGroupDto[] }>('/szpt')).groups,
    getSzptProducts: (query) =>
      get<SzptProductDto[]>(`/szpt/${encodeURIComponent(query.group)}/products`, toSzptSearchParams(query)),
  }
}

/** Фасовки повторяются: ?size=800&size=1000. Сортировка по умолчанию (price_asc) в URL не пишется */
export function toSzptSearchParams(query: SzptQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const size of query.sizes ?? []) params.append('size', String(size))
  if (query.sort && query.sort !== 'price_asc') params.set('sort', query.sort)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.offset !== undefined) params.set('offset', String(query.offset))
  return params
}

/** Мульти-значения передаются повторением параметра: ?volumeMl=500&volumeMl=1000 */
export function toSearchParams(query: ProductQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.category) params.set('category', query.category)
  if (query.search?.trim()) params.set('search', query.search.trim())
  for (const [key, values] of Object.entries(query.filters ?? {})) {
    for (const value of values) params.append(key, value)
  }
  if (query.sort) params.set('sort', query.sort)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.offset !== undefined) params.set('offset', String(query.offset))
  return params
}
