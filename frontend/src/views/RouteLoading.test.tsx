import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findCachedProduct } from '../api/cachedProduct'
import { catalogApi } from '../api/catalogApi'
import { categoriesQuery, productPagesQuery, productQuery } from '../api/queries'
import { getI18n } from '../i18n'
import { navigation } from '../test/navigation'
import { CategoryPageLoading } from './CategoryPage'
import { ProductPagePreview } from './ProductPage'

const MILK_ID = 'p0a1f000-0000-4000-8000-000000000001'

/** Как renderPage, но кэш задаёт тест: состояние «уже были на странице со списком» */
function renderWith(client: QueryClient, ui: ReactNode, url: string) {
  navigation.setUrl(url)
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={getI18n('ru')}>{ui}</I18nextProvider>
    </QueryClientProvider>,
  )
}

/** Кэш после открытой категории: первая страница списка, где есть молоко */
async function clientWithCategoryList() {
  const milk = await catalogApi.getProduct(MILK_ID)
  const client = new QueryClient()
  const list = await catalogApi.getProducts({ category: milk.category.slug, limit: 24, offset: 0 })
  client.setQueryData(productPagesQuery({ category: milk.category.slug }).queryKey, { pages: [list], pageParams: [0] })
  return { client, milk }
}

afterEach(() => vi.restoreAllMocks())

describe('findCachedProduct', () => {
  it('находит товар в списке категории', async () => {
    const { client, milk } = await clientWithCategoryList()
    expect(findCachedProduct(client, MILK_ID)?.name).toBe(milk.name)
  })

  it('берёт собственный запрос товара, если он есть', async () => {
    const client = new QueryClient()
    const milk = await catalogApi.getProduct(MILK_ID)
    client.setQueryData(productQuery(MILK_ID).queryKey, milk)
    expect(findCachedProduct(client, MILK_ID)).toBe(milk)
  })

  it('пустой кэш — ничего', () => {
    expect(findCachedProduct(new QueryClient(), MILK_ID)).toBeUndefined()
  })
})

describe('ProductPagePreview (loading.tsx товара)', () => {
  it('товар из списка — сразу название и цена, без запросов к API', async () => {
    const { client, milk } = await clientWithCategoryList()
    const spies = [vi.spyOn(catalogApi, 'getProduct'), vi.spyOn(catalogApi, 'getCategoryFilters')]
    renderWith(client, <ProductPagePreview id={MILK_ID} />, `/ru/products/${MILK_ID}`)

    expect(screen.getByRole('heading', { level: 1, name: milk.name, hidden: true })).toBeInTheDocument()
    expect(screen.getByTestId('min-price')).toHaveTextContent('570')
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('товара нет в кэше — скелетон страницы', () => {
    renderWith(new QueryClient(), <ProductPagePreview id={MILK_ID} />, `/ru/products/${MILK_ID}`)
    expect(screen.getByTestId('product-page-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})

describe('CategoryPageLoading (loading.tsx категории)', () => {
  it('категории в кэше — настоящий заголовок, ниже скелетон', async () => {
    const categories = await catalogApi.getCategories()
    const client = new QueryClient()
    client.setQueryData(categoriesQuery().queryKey, categories)
    const spy = vi.spyOn(catalogApi, 'getCategoryFilters')
    renderWith(client, <CategoryPageLoading slug={categories[0].slug} />, `/ru/collections/${categories[0].slug}`)

    expect(screen.getByRole('heading', { level: 1 })).not.toBeEmptyDOMElement()
    expect(screen.getByTestId('category-page-skeleton')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('кэш пуст — скелетон целиком, вместе с заголовком', () => {
    renderWith(new QueryClient(), <CategoryPageLoading slug="dairy" />, '/ru/collections/dairy')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByTestId('category-page-skeleton')).toBeInTheDocument()
  })
})
