import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_PAGES, infiniteLoadMore, type InfinitePages, type LoadMoreProps } from '../../lib/loadMore'
import { LoadMore } from './LoadMore'

let callbacks: ((entries: { isIntersecting: boolean }[]) => void)[] = []

beforeEach(() => {
  callbacks = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        callbacks.push(cb)
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

const scrollToButton = () => act(() => callbacks.at(-1)?.([{ isIntersecting: true }]))

const props = (over: Partial<LoadMoreProps> = {}): LoadMoreProps => ({
  hasMore: true,
  loading: false,
  auto: true,
  onLoad: vi.fn(),
  ...over,
})

describe('LoadMore', () => {
  it('сам грузит следующую порцию, когда кнопка подходит к экрану', () => {
    const p = props()
    render(<LoadMore {...p} />)
    expect(p.onLoad).not.toHaveBeenCalled()
    scrollToButton()
    expect(p.onLoad).toHaveBeenCalledTimes(1)
  })

  it('пока грузится — не шлёт второй запрос, кнопка «Загрузка…» недоступна', () => {
    const p = props({ loading: true })
    render(<LoadMore {...p} />)
    scrollToButton()
    expect(p.onLoad).not.toHaveBeenCalled()
    expect(screen.getByTestId('load-more')).toBeDisabled()
  })

  it('когда загрузка закончилась, а кнопка всё ещё у экрана — грузит дальше', () => {
    const p = props({ loading: true })
    const { rerender } = render(<LoadMore {...p} />)
    scrollToButton()
    rerender(<LoadMore {...p} loading={false} />)
    expect(p.onLoad).toHaveBeenCalledTimes(1)
  })

  it('без auto грузит только по кнопке', () => {
    const p = props({ auto: false })
    render(<LoadMore {...p} />)
    scrollToButton()
    expect(p.onLoad).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(p.onLoad).toHaveBeenCalledTimes(1)
  })

  it('без следующей порции ничего не рендерит', () => {
    render(<LoadMore {...props({ hasMore: false })} />)
    expect(screen.queryByTestId('load-more')).not.toBeInTheDocument()
  })
})

describe('infiniteLoadMore', () => {
  const pages = (over: Partial<InfinitePages> = {}): InfinitePages => ({
    data: { pages: [[]] },
    hasNextPage: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPlaceholderData: false,
    fetchNextPage: vi.fn(),
    ...over,
  })

  it('сам грузит, пока страниц меньше лимита', () => {
    expect(infiniteLoadMore(pages()).auto).toBe(true)
    expect(infiniteLoadMore(pages({ data: { pages: Array.from({ length: AUTO_PAGES }, () => []) } })).auto).toBe(false)
  })

  it('после ошибки и пока показан прежний список (смена фильтров) — только по кнопке', () => {
    expect(infiniteLoadMore(pages({ isFetchNextPageError: true })).auto).toBe(false)
    expect(infiniteLoadMore(pages({ isPlaceholderData: true })).auto).toBe(false)
  })

  it('не отменяет и не дублирует уже идущий запрос', () => {
    const p = pages()
    infiniteLoadMore(p).onLoad()
    expect(p.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false })
  })
})
