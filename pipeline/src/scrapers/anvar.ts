import { politeFetch, type PoliteOptions } from '../http.js'
import type { SourceFile, SourceProduct } from '../types.js'
import { weightMultiplier } from './dina.js'

// Анвар работает на той же платформе, что Dina. Открытый каталог есть только у одного магазина сети
// (shop 7); Анвар подтвердил, что каталог и цены совпадают с Актау на 98% (docs/data/ANVAR_SOURCE.md).
const ENDPOINT = 'https://backend.shop.anvar.kz/api/v1.1/customer/graph'
const SHOP_ID = '7' // «Анвар (Гипер)»
const PAGE_SIZE = 24
// Без accept-language: ru названия приходят на казахском
const HEADERS = { 'content-type': 'application/json', 'accept-language': 'ru' }

const SHOPS_QUERY = `{ shops { id name } }`
const ROOTS_QUERY = `query getRoots($shopId: ID!) { categories(shop_id: $shopId) { id name parent_id } }`
const CHILDREN_QUERY = `query getChildren($shopId: ID!, $parentId: ID) { categories(shop_id: $shopId, parent_id: $parentId) { id name parent_id } }`
const PRODUCTS_QUERY = `query getProducts($shopId: ID!, $categoryId: ID, $page: Int, $limit: Int) {
  products(shop_id: $shopId, category_id: $categoryId, _page: $page, _limit: $limit) {
    pageInfo { total lastPage }
    edges { id xid slug name price_type preview { url } images { url } priceOffers { price oldPrice quant quantAmount isDefault } categories { id name } }
  }
}`

export type AnvarItem = {
  id?: string; name?: string; price_type?: string; preview?: { url?: string } | null; images?: { url?: string }[]
  priceOffers?: { price?: number; oldPrice?: number; quant?: string; quantAmount?: number; isDefault?: boolean }[]
  categories?: { id: string; name: string }[]
}
export type AnvarScopeCategory = { id: string; name: string }

/**
 * Категории Анвара, соответствующие публикуемым категориям сайта (социально значимые товары).
 * Скрап Анвара всегда ограничен ими: SCRAPE_ALL его не расширяет.
 */
export const ANVAR_SCOPE: readonly AnvarScopeCategory[] = [
  { id: '8971', name: 'Фрукты, овощи, грибы' }, // vegetables
  { id: '8965', name: 'Хлеб, хлебопродукты' }, // bread
  { id: '9192', name: 'Молоко' }, // milk
  { id: '9190', name: 'Кисломолочные продукты' }, // dairy
  { id: '9189', name: 'Йогурты и десерты' },
  { id: '9194', name: 'Сметана' },
  { id: '9197', name: 'Творог' },
  { id: '9193', name: 'Сливки, сухое молоко' },
  { id: '9191', name: 'Масло сливочное, спреды' },
  { id: '9196', name: 'Сыры' },
  { id: '9195', name: 'Сыры плавленые' },
  { id: '9164', name: 'Яйцо' }, // eggs
  { id: '9733', name: 'Свежее мясо' }, // meat
  { id: '9181', name: 'Птица, полуфабрикаты' },
  { id: '9068', name: 'Крупы, мука' }, // groats
  { id: '9072', name: 'Макароны' },
  { id: '9047', name: 'Супы, лапша, кисели' },
  { id: '9075', name: 'Соль, сахар, сода, уксус' }, // sugar
  { id: '9098', name: 'Растительные масла' }, // oil
  { id: '9043', name: 'Чай' }, // tea-coffee
  { id: '9140', name: 'Свежая рыба, морепродукты' }, // fish
]

export function assertAnvarShop(shops: { id: string }[], shopId: string): void {
  if (!shops.some((s) => String(s.id) === shopId)) throw new Error(`ANVAR: shop ${shopId} not found`)
}

/**
 * Множитель веса для KGM-товара. weightMultiplier Dina граммы с кириллицей не видит (`\b` после «г» в JS
 * не срабатывает), поэтому «Сыр 300 г вес» у неё получил бы 1000. Dina не меняем (её цены в проде) —
 * граммы с кириллическим окончанием разбираем здесь.
 */
function anvarWeightMultiplier(name: string): number {
  const base = weightMultiplier(name)
  if (base !== 1000) return base
  const g = name.match(/(\d+(?:[.,]\d+)?)\s*(?:г|гр|g)(?![а-яa-z])/i)
  return g && parseFloat(g[1]!.replace(',', '.')) > 50 ? parseFloat(g[1]!.replace(',', '.')) : 1000
}

/** Цена — только из priceOffers: верхнеуровневое price у весовых товаров округлено до цены за грамм */
export function mapAnvarItem(item: AnvarItem): SourceProduct | null {
  const name = item.name?.trim() ?? ''
  if (!name || !item.id) return null
  const offers = item.priceOffers ?? []
  const offer = offers.find((o) => o.isDefault) ?? offers[0]
  if (!offer) return null
  const raw = Number(offer.price)
  if (!Number.isFinite(raw) || raw <= 0) return null
  if (offer.quantAmount != null && offer.quantAmount !== 1) return null
  const kg = offer.quant === 'KGM'
  const k = kg ? anvarWeightMultiplier(name) : 1
  const scaled = (v: number) => (kg ? Math.round((v * k) / 1000) : Math.round(v))
  const price = scaled(raw)
  if (price <= 0) return null
  const oldRaw = Number(offer.oldPrice)
  const old = Number.isFinite(oldRaw) && oldRaw > 0 ? scaled(oldRaw) : null
  const previewUrl = item.preview?.url
  const barcode = previewUrl?.match(/\/imported\/(\d{8,14})-/)?.[1] ?? null
  return {
    sourceProductId: `anvar_${item.id}`,
    name,
    price,
    oldPrice: old && old > price ? old : null,
    imageUrl: previewUrl || item.images?.find((i) => i.url)?.url || null,
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: (item.categories ?? []).map((c) => c.name),
    rawPayload: { ...item, priceUnit: kg ? 'kg' : null, pricePerUnitMultiplier: k, barcode },
  }
}

type GraphResponse<T> = { data?: T }
type Category = { id: string; name: string; parent_id?: string | number | null }
type ProductsData = { products?: { pageInfo?: { total?: number; lastPage?: number }; edges?: AnvarItem[] } }

export async function scrapeAnvar(opts: {
  fetchImpl?: typeof fetch; delayMs?: number; maxPages?: number; scope?: readonly AnvarScopeCategory[]
} = {}): Promise<SourceFile> {
  const scope = opts.scope ?? ANVAR_SCOPE
  const http: PoliteOptions = { fetchImpl: opts.fetchImpl, delayMs: opts.delayMs ?? 300 }
  const graph = async <T>(query: string, variables: Record<string, unknown>) => {
    const res = await politeFetch(ENDPOINT, { method: 'POST', headers: HEADERS, body: JSON.stringify({ query, variables }) }, http)
    return ((await res.json()) as GraphResponse<T>).data
  }
  const shops = (await graph<{ shops?: { id: string }[] }>(SHOPS_QUERY, {}))?.shops ?? []
  assertAnvarShop(shops, SHOP_ID)

  const roots = (await graph<{ categories?: Category[] }>(ROOTS_QUERY, { shopId: SHOP_ID }))?.categories ?? []
  if (roots.length === 0) throw new Error('ANVAR: category list is empty')
  const childrenCache = new Map<string, Category[]>()
  const childrenOf = async (id: string) => {
    let kids = childrenCache.get(id)
    if (!kids) {
      kids = (await graph<{ categories?: Category[] }>(CHILDREN_QUERY, { shopId: SHOP_ID, parentId: id }))?.categories ?? []
      childrenCache.set(id, kids)
    }
    return kids
  }
  const known = new Map(roots.map((c) => [String(c.id), c]))
  for (const root of roots) for (const kid of await childrenOf(String(root.id))) known.set(String(kid.id), kid)
  for (const s of scope) {
    if (!known.has(s.id)) throw new Error(`ANVAR: scope category ${s.id} ${s.name} not found`)
  }

  const walk = new Map<string, string>() // id → name: scope + все потомки
  const visit = async (id: string, name: string) => {
    if (walk.has(id)) return
    walk.set(id, name)
    for (const kid of await childrenOf(id)) await visit(String(kid.id), kid.name)
  }
  for (const s of scope) await visit(s.id, s.name)

  const products = new Map<string, SourceProduct>()
  const scopeIds = new Set(scope.map((s) => s.id))
  let errorCount = 0, pages = 0, total = 0
  for (const [categoryId, categoryName] of walk) {
    for (let page = 1; page <= (opts.maxPages ?? 1000); page++) {
      try {
        const data = await graph<ProductsData>(PRODUCTS_QUERY, { shopId: SHOP_ID, categoryId, page, limit: PAGE_SIZE })
        pages++
        const edges = data?.products?.edges ?? []
        if (page === 1 && scopeIds.has(categoryId)) total += data?.products?.pageInfo?.total ?? 0
        for (const e of edges) {
          const p = mapAnvarItem(e)
          if (p && !products.has(p.sourceProductId)) products.set(p.sourceProductId, p)
        }
        if (edges.length < PAGE_SIZE || page >= (data?.products?.pageInfo?.lastPage ?? Infinity)) break
      } catch (err) {
        errorCount++
        console.warn(`[ANVAR] category ${categoryId} page ${page}: ${(err as Error).message}`)
        if (errorCount > 10) throw new Error('ANVAR: too many page errors, aborting')
        break
      }
    }
    console.log(`[ANVAR] ${categoryId} ${categoryName}: total ${products.size}`)
  }
  return {
    storeCode: 'ANVAR', city: 'Aktau', capturedAt: new Date().toISOString(), errorCount,
    sourceStats: { shopId: SHOP_ID, total, pages, categories: walk.size, scoped: true },
    products: [...products.values()],
  }
}
