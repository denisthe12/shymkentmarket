import type { HttpClient, StoreModule } from '../../core/index.js'
import { parseMagnumPage } from './parse.js'
import { MAGNUM_PLATFORM_ID, MAGNUM_SCOPE } from './scope.js'

export type MagnumTask = { category: string; page: number }
export type MagnumContext = { authorization: string }

/** Hard cap on pages per leaf (the largest observed leaf has 11). */
export const MAGNUM_MAX_PAGES = 100

const BASE = 'https://mgo-gw1.e-magnum.kz'
const PAGE_SIZE = 20
// Public geocoder point for the city of Shymkent.
const CITY_LATITUDE = '42.368009'
const CITY_LONGITUDE = '69.612769'

const BY_ID = new Map(MAGNUM_SCOPE.map(c => [c.id, c]))

function scopeCategory(id: string) {
  const category = BY_ID.get(id)
  if (!category) throw new Error(`Magnum: category ${id} is not in MAGNUM_SCOPE`)
  return category
}

export const magnumModule: StoreModule<MagnumTask, MagnumContext> = {
  storeCode: 'MAGNUM',
  city: 'Shymkent',
  limits: { concurrency: 4, rps: 8, maxConcurrency: 8, maxRps: 20 },
  headers: { accept: 'application/json' },

  async prepare(http: HttpClient) {
    const login = await http.json<{ token?: unknown }>(`${BASE}/auth/server/api/v1/security/guest/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    if (typeof login?.token !== 'string' || !login.token) throw new Error('Magnum: guest login returned no token')

    const query = new URLSearchParams({ latitude: CITY_LATITUDE, longitude: CITY_LONGITUDE })
    const attrs = await http.json<{ darkStore?: { id?: unknown } | null }>(`${BASE}/productstore/geo/api/v1/type/all/attributes?${query}`)
    const storeId = attrs?.darkStore?.id
    if (storeId !== MAGNUM_PLATFORM_ID) throw new Error(`Magnum: expected store ${MAGNUM_PLATFORM_ID}, got ${String(storeId)}`)

    return { authorization: login.token }
  },

  seeds: () => MAGNUM_SCOPE.map(c => ({ category: c.id, page: 0 })),

  async handle(task, ctx, http) {
    const category = scopeCategory(task.category)
    const query = new URLSearchParams({
      platformId: String(MAGNUM_PLATFORM_ID),
      categoryIds: category.id,
      sortTypeColumn: 'sales',
      sortOrder: 'DESC',
      pageId: String(task.page),
      pageSize: String(PAGE_SIZE),
      filterIds: '',
    })
    const body = await http.json(`${BASE}/catalog/client/platformItemV2?${query}`, { headers: { authorization: ctx.authorization } })
    const page = parseMagnumPage(body, category, task.page)
    if (page.nextPage !== null && page.nextPage >= MAGNUM_MAX_PAGES) {
      throw new Error(`Magnum category ${category.id}: more than ${MAGNUM_MAX_PAGES} pages, stopping`)
    }
    return {
      products: page.products,
      seen: page.seen,
      next: page.nextPage === null ? [] : [{ category: task.category, page: page.nextPage }],
    }
  },

  describe(task) {
    const leaf = BY_ID.get(task.category)?.path.at(-1) ?? '?'
    return `Magnum category ${task.category} (${leaf}) page ${task.page}`
  },
}
