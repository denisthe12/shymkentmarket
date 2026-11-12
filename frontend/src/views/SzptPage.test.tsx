import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { connection } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SzptIndexRoute from '../app/[lang]/(site)/szpt/page'
import SzptGroupRoute from '../app/[lang]/(site)/szpt/[group]/page'
import { catalogApi } from '../api/catalogApi'
import { ApiError } from '../api/types'
import { getI18n } from '../i18n'
import { szptGroupName } from '../lib/dataLabels'
import { navigation } from '../test/navigation'
import { renderPage } from '../test/render'
import { SzptPage } from './SzptPage'

// The index reads the API, so it must render per request, not at build time (the build has no API)
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(),
  connection: vi.fn(async () => undefined),
}))

const cardNames = () =>
  screen.getAllByTestId('product-card').map((card) => within(card).getByRole('link').textContent)
const plain = (el: Element) => el.textContent?.replace(/\s/g, ' ')
// Фасовки — фильтр-карточка, как в категории (на lg в колонке слева; в jsdom она в DOM всегда)
const sizeChip = (name: RegExp) => within(screen.getByTestId('filter-sizeGrams')).getByRole('button', { name })

describe('SzptPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the section, group chips, pack sizes and unit prices', async () => {
    renderPage(<SzptPage group="rice" />, '/ru/szpt/rice')
    expect(await screen.findByRole('heading', { level: 1, name: 'Социально значимые продукты' })).toBeInTheDocument()
    expect(await screen.findByText(/10 позиций из перечня СЗПТ \(приказ МТИ РК № 362-нқ\)/)).toBeInTheDocument()
    expect(screen.getByTestId('szpt-group-rice')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('szpt-group-milk')).toHaveAttribute('href', '/ru/szpt/milk')
    expect(sizeChip(/^1\s+кг$/)).toBeInTheDocument()
    expect(within(screen.getByTestId('filter-sizeGrams')).getByText('Фасовка')).toBeInTheDocument()
    expect(await screen.findAllByTestId('product-card')).toHaveLength(3)
    expect(cardNames()).toEqual(['Рис Тест 500 г', 'Рис Кызылординский 800 г', 'Рис Тест 1 кг'])
    expect(screen.getAllByTestId('unit-price').map(plain)).toEqual(['840 ₸/кг', '750 ₸/кг', '710 ₸/кг'])
  })

  it('filters by pack size and switches to unit-price sort in the URL', async () => {
    renderPage(<SzptPage group="rice" />, '/ru/szpt/rice')
    await screen.findAllByTestId('product-card')
    await userEvent.click(sizeChip(/^500\s+г$/))
    expect(navigation.url).toBe('/ru/szpt/rice?size=500')
    await expect.poll(() => cardNames()).toEqual(['Рис Тест 500 г'])

    await userEvent.click(sizeChip(/^500\s+г$/))
    expect(navigation.url).toBe('/ru/szpt/rice')
    expect(screen.getByRole('option', { name: 'Выгоднее за кг' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByTestId('sort-select'), 'unit_price_asc')
    expect(navigation.url).toBe('/ru/szpt/rice?sort=unit_price_asc')
    await expect.poll(() => cardNames()).toEqual(['Рис Тест 1 кг', 'Рис Кызылординский 800 г', 'Рис Тест 500 г'])
    expect(screen.getByTestId('sort-select')).toHaveValue('unit_price_asc')
  })

  it('names the unit of the group in the sort label', async () => {
    renderPage(<SzptPage group="eggs" />, '/ru/szpt/eggs')
    expect(await screen.findByRole('option', { name: 'Выгоднее за 10 шт' })).toBeInTheDocument()
  })

  it('is a not-found page for an unknown group', async () => {
    renderPage(<SzptPage group="nope" />, '/ru/szpt/nope')
    expect(await screen.findByRole('heading', { level: 1, name: 'Такой страницы нет' })).toBeInTheDocument()
  })
})

describe('szptGroupName', () => {
  it('translates known groups and falls back to the API name', () => {
    const kk = getI18n('kk').t
    expect(szptGroupName(kk, { slug: 'rice', name: 'Рис' })).toBe('Күріш')
    expect(szptGroupName(kk, { slug: 'new-group', name: 'Мука' })).toBe('Мука')
    expect(szptGroupName(getI18n('ru').t, { slug: 'rice', name: 'Рис' })).toBe('Рис')
  })
})

describe('SZPT routes', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders a group with filters from the server without a loading state', async () => {
    const page = await SzptGroupRoute({
      params: Promise.resolve({ lang: 'ru', group: 'rice' }),
      searchParams: Promise.resolve({ size: ['500', '999'], sort: 'unit_price_asc' }),
    })
    renderPage(page, '/ru/szpt/rice?size=500&size=999&sort=unit_price_asc')
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    // 999 нет среди фасовок группы — отбрасывается, а не превращается в 400 от API
    expect(cardNames()).toEqual(['Рис Тест 500 г'])
  })

  it('still renders when the products request fails (a size gone from a newer snapshot)', async () => {
    vi.spyOn(catalogApi, 'getSzptProducts').mockRejectedValue(new ApiError(400, 'size is not available'))
    const page = await SzptGroupRoute({
      params: Promise.resolve({ lang: 'ru', group: 'rice' }),
      searchParams: Promise.resolve({ size: '500' }),
    })
    renderPage(page, '/ru/szpt/rice?size=500')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Социально значимые продукты')
  })

  it('is a 404 for an unknown group', async () => {
    await expect(
      SzptGroupRoute({ params: Promise.resolve({ lang: 'ru', group: 'nope' }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('redirects the section index to the first group', async () => {
    vi.mocked(connection).mockClear()
    await expect(SzptIndexRoute({ params: Promise.resolve({ lang: 'kk' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT /kk/szpt/rice')
    expect(connection).toHaveBeenCalledOnce()
  })

  it('is a 404, not a redirect loop, when no group has products', async () => {
    vi.spyOn(catalogApi, 'getSzptGroups').mockResolvedValue([])
    await expect(SzptIndexRoute({ params: Promise.resolve({ lang: 'ru' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
