import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpAdapter, toSearchParams } from './httpAdapter'
import { ApiError } from './types'

describe('toSearchParams', () => {
  it('repeats multi-select values and skips empty search', () => {
    const params = toSearchParams({
      category: 'milk',
      search: '  ',
      filters: { volumeMl: ['500', '1000'], lactoseFree: ['true'] },
      sort: 'price_asc',
      limit: 24,
      offset: 0,
    })
    expect(params.toString()).toBe(
      'category=milk&volumeMl=500&volumeMl=1000&lactoseFree=true&sort=price_asc&limit=24&offset=0',
    )
  })
})

describe('http adapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls /api under the base url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])))
    vi.stubGlobal('fetch', fetchMock)
    await createHttpAdapter('http://api.test/').getProducts({ category: 'milk', limit: 24, offset: 0 })
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/products?category=milk&limit=24&offset=0')
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('next')
  })

  it('bounds server GET caching and tags catalog data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]'))
    vi.stubGlobal('fetch', fetchMock)
    await createHttpAdapter('http://api.test', true).getCategories()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ next: { revalidate: 3600, tags: ['catalog-data'] } })
  })

  it('does not replace a provider failure with mock data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))
    await expect(createHttpAdapter('http://api.test', true).getCategories()).rejects.toMatchObject({ status: 503 })
  })

  it('joins API v1 validation messages', async () => {
    const body = { statusCode: 400, message: ['sort must be one of price_asc, price_desc, name_asc'], error: 'Bad Request' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })))
    const error = await createHttpAdapter('http://api.test').getCategories().catch((e) => e)
    expect(error).toMatchObject({ status: 400, message: body.message[0] })
  })

  it('maps API v1 errors to ApiError', async () => {
    const body = { statusCode: 404, message: 'Product not found', error: 'Not Found' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 404 })))
    const error = await createHttpAdapter('http://api.test').getProduct('1').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Product not found' })
  })
})

describe('szpt http adapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('repeats sizes, always sends sort and pages', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('[]'))
    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpAdapter('http://api.test')
    await api.getSzptProducts({ group: 'rice', sizes: [800, 1000], sort: 'unit_price_asc', limit: 24, offset: 0 })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://api.test/api/szpt/rice/products?size=800&size=1000&sort=unit_price_asc&limit=24&offset=0',
    )
    await api.getSzptProducts({ group: 'rice', sort: 'price_asc', limit: 24, offset: 24 })
    expect(fetchMock.mock.calls[1][0]).toBe('http://api.test/api/szpt/rice/products?sort=price_asc&limit=24&offset=24')
  })

  it('unwraps the groups envelope', async () => {
    const groups = [{ slug: 'rice', name: 'Рис', unit: 'kg', sizes: [800], count: 1 }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ groups }))))
    await expect(createHttpAdapter('http://api.test').getSzptGroups()).resolves.toEqual(groups)
  })
})
