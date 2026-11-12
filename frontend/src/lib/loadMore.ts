/** Сколько порций подгружаем сами при прокрутке; дальше — по кнопке, чтобы можно было дойти до футера */
export const AUTO_PAGES = 5

export type LoadMoreProps = {
  /** Есть что догрузить — иначе кнопки нет */
  hasMore: boolean
  /** Порция грузится: кнопка «Загрузка…», новых запросов не шлём */
  loading: boolean
  /** Можно грузить самим при прокрутке (лимит порций, нет ошибки и т. п.) */
  auto: boolean
  onLoad: () => void
}

/** Нужная часть результата useInfiniteQuery */
export type InfinitePages = {
  data?: { pages: readonly unknown[] }
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  isPlaceholderData: boolean
  fetchNextPage: (options?: { cancelRefetch?: boolean }) => unknown
}

/**
 * Пропсы LoadMore для useInfiniteQuery. После ошибки сами не повторяем — остаётся кнопка; пока показан прежний
 * список (смена фильтров) — не грузим. cancelRefetch: false — повторный вызов во время загрузки не дублирует запрос
 */
export function infiniteLoadMore(pages: InfinitePages): LoadMoreProps {
  return {
    hasMore: pages.hasNextPage,
    loading: pages.isFetchingNextPage,
    auto: (pages.data?.pages.length ?? 0) < AUTO_PAGES && !pages.isFetchNextPageError && !pages.isPlaceholderData,
    onLoad: () => void pages.fetchNextPage({ cancelRefetch: false }),
  }
}
