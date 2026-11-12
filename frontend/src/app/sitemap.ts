import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { catalogApi } from '../api/catalogApi'
import type { ProductCardDto } from '../api/types'
import { AUTHORS, blogPagePath, postPath, totalPages } from '../content/blog'
import { POSTS } from '../content/blog/posts'
import { LANGUAGES } from '../i18n/languages'
import { localePath } from '../lib/paths'
import { hreflangPaths } from '../lib/seo'
import { absoluteUrl } from '../lib/site'

// Build never fetches the API; GET data is cached at runtime for an hour.

const PAGE_SIZE = 100
/** Предел на случай, если API игнорирует offset: 50 страниц × 100 товаров × 2 языка — в лимите sitemap (50 000) */
const MAX_PAGES = 50
const MAX_IN_FLIGHT = 4

async function allProducts(): Promise<ProductCardDto[]> {
  const products: ProductCardDto[] = []
  for (let page = 0; page < MAX_PAGES;) {
    // A short first page still needs one request. For a full catalog, avoid
    // serial network roundtrips; Promise.all preserves the original page order.
    const width = Math.min(page === 0 ? 1 : MAX_IN_FLIGHT, MAX_PAGES - page)
    const batches = await Promise.all(Array.from({ length: width }, (_, i) =>
      catalogApi.getProducts({ limit: PAGE_SIZE, offset: (page + i) * PAGE_SIZE }),
    ))
    for (const batch of batches) {
      products.push(...batch)
      if (batch.length < PAGE_SIZE) return products
    }
    page += width
  }
  return products
}

/** Каждая страница — на всех языках, с hreflang-альтернативами (как в <head>) */
function localized(path: string, extra: Omit<MetadataRoute.Sitemap[number], 'url'>): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(Object.entries(hreflangPaths(path)).map(([l, href]) => [l, absoluteUrl(href)]))
  return LANGUAGES.map((lang) => ({ url: absoluteUrl(localePath(lang, path)), alternates: { languages }, ...extra }))
}

/** Блог: список и авторы — на всех языках; статья — только по адресу своего языка, без hreflang */
function blogEntries(): MetadataRoute.Sitemap {
  const lastPost = POSTS.map((post) => post.updated).sort().at(-1)
  const posts = POSTS.map((post) => ({
    url: absoluteUrl(localePath(post.lang, postPath(post))),
    lastModified: post.updated,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))
  const authors = AUTHORS.flatMap((author) =>
    localized(`/blog/authors/${author.id}`, { changeFrequency: 'monthly', priority: 0.3 }),
  )
  const pages = Array.from({ length: totalPages() }, (_, i) =>
    localized(blogPagePath(i + 1), { lastModified: lastPost, changeFrequency: 'weekly', priority: i === 0 ? 0.6 : 0.4 }),
  ).flat()
  return [...pages, ...posts, ...authors]
}

// Поиск не включён — он noindex
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  const [categories, dashboard, products, szptGroups] = await Promise.all([
    catalogApi.getCategories(),
    catalogApi.getDashboard(),
    allProducts(),
    catalogApi.getSzptGroups(),
  ])
  const snapshot = dashboard.summary.snapshotAt

  return [
    ...blogEntries(),
    // /ru и /kk — редирект на каталог, в sitemap им не место
    ...localized('/catalog', { lastModified: snapshot, changeFrequency: 'daily', priority: 1 }),
    ...localized('/dashboard', { lastModified: snapshot, changeFrequency: 'daily', priority: 0.6 }),
    ...categories.flatMap((category) =>
      localized(`/collections/${category.slug}`, { lastModified: snapshot, changeFrequency: 'daily', priority: 0.8 }),
    ),
    // /szpt — редирект на первую группу, в sitemap только сами группы
    ...szptGroups.flatMap((group) =>
      localized(`/szpt/${group.slug}`, { lastModified: snapshot, changeFrequency: 'daily', priority: 0.8 }),
    ),
    ...products.flatMap((product) =>
      localized(`/products/${product.id}`, {
        lastModified: product.snapshotAt,
        changeFrequency: 'daily',
        priority: 0.7,
        ...(product.imageUrl && { images: [product.imageUrl] }),
      }),
    ),
  ]
}
