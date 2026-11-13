import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clickTarget, previewRoute } from '../../lib/navigationPreview'
import { navigation } from '../../test/navigation'
import { renderPage } from '../../test/render'
import { NavigationPreview, PREVIEW_DELAY } from './NavigationPreview'

describe('previewRoute', () => {
  it('узнаёт страницы с заглушкой', () => {
    expect(previewRoute('/ru/products/p1')).toEqual({ kind: 'product', id: 'p1' })
    expect(previewRoute('/kk/collections/milk')).toEqual({ kind: 'category', slug: 'milk' })
    expect(previewRoute('/ru/szpt')).toEqual({ kind: 'szpt' })
    expect(previewRoute('/ru/szpt/rice')).toEqual({ kind: 'szpt' })
    expect(previewRoute('/ru/catalog')).toEqual({ kind: 'catalog' })
    expect(previewRoute('/ru/dashboard')).toEqual({ kind: 'dashboard' })
  })

  it('остальное — без заглушки', () => {
    expect(previewRoute('/ru/search')).toBeNull()
    expect(previewRoute('/ru/blog/post')).toBeNull()
    expect(previewRoute('/ru/catalog/extra')).toBeNull()
    expect(previewRoute('/ru/products')).toBeNull()
  })
})

describe('clickTarget', () => {
  const current = new URL('http://localhost/ru/catalog')
  const anchor = (href: string, attrs: Record<string, string> = {}) => {
    const a = document.createElement('a')
    a.href = href
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v)
    return a
  }
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }

  it('обычный клик по ссылке на другую страницу сайта', () => {
    expect(clickTarget(click, anchor('/ru/products/p1'), current)).toBe('/ru/products/p1')
  })

  it('новая вкладка, другой сайт, та же страница или смена языка — нет', () => {
    expect(clickTarget({ ...click, ctrlKey: true }, anchor('/ru/products/p1'), current)).toBeNull()
    expect(clickTarget({ ...click, button: 1 }, anchor('/ru/products/p1'), current)).toBeNull()
    expect(clickTarget(click, anchor('/ru/products/p1', { target: '_blank' }), current)).toBeNull()
    expect(clickTarget(click, anchor('https://example.com/ru/products/p1'), current)).toBeNull()
    expect(clickTarget(click, anchor('/ru/catalog?x=1'), current)).toBeNull()
    expect(clickTarget(click, anchor('/kk/catalog'), current)).toBeNull()
  })
})

describe('NavigationPreview', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const page = () =>
    renderPage(
      <NavigationPreview>
        <h1>Каталог</h1>
        <a href="/ru/dashboard" onClick={(e) => e.preventDefault()}>
          Аналитика
        </a>
        <a href="/ru/search?q=1" onClick={(e) => e.preventDefault()}>
          Поиск
        </a>
      </NavigationPreview>,
      '/ru/catalog',
    )

  it('после клика на месте страницы — заглушка будущей; текущая скрыта, но не размонтирована', () => {
    page()
    fireEvent.click(screen.getByText('Аналитика'))
    // На быстрой сети страница успевает раньше — заглушки ещё нет
    expect(screen.queryByTestId('navigation-preview')).toBeNull()
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY))
    expect(screen.getByTestId('navigation-preview')).toHaveTextContent('Аналитика')
    expect(screen.getByRole('heading', { level: 1, name: /Аналитика/ })).toBeInTheDocument()
    expect(screen.getByText('Каталог', { selector: 'h1' })).not.toBeVisible()
  })

  it('адрес сменился — заглушка уходит', () => {
    page()
    fireEvent.click(screen.getByText('Аналитика'))
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY))
    act(() => navigation.setUrl('/ru/dashboard'))
    expect(screen.queryByTestId('navigation-preview')).toBeNull()
  })

  it('«Назад» в браузере во время ожидания — заглушка уходит', () => {
    page()
    fireEvent.click(screen.getByText('Аналитика'))
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY))
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(screen.queryByTestId('navigation-preview')).toBeNull()
    expect(screen.getByText('Каталог', { selector: 'h1' })).toBeVisible()
  })

  it('страницы без заглушки (поиск) — ничего не подменяем', () => {
    page()
    fireEvent.click(screen.getByText('Поиск'))
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY * 2))
    expect(screen.queryByTestId('navigation-preview')).toBeNull()
  })
})
