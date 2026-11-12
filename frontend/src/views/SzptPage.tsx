'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useSzptGroups, useSzptPages } from '../api/queries'
import type { SzptSort } from '../api/types'
import { BackLink } from '../components/layout/BackLink'
import { ProductGrid } from '../components/product/ProductGrid'
import { Button } from '../components/ui/Button'
import { Chip, chipClass } from '../components/ui/Chip'
import { CategoryPageSkeleton, ProductGridSkeleton } from '../components/ui/Skeleton'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { szptGroupName } from '../lib/dataLabels'
import { formatDate } from '../lib/format'
import { formatPackSize, readSzptState, szptParams } from '../lib/szpt'
import { replaceQuery } from '../lib/urlState'
import { useHref } from '../lib/useLang'
import { NotFoundPage } from './NotFoundPage'

const SORTS: SzptSort[] = ['price_asc', 'unit_price_asc']

/** Раздел СЗПТ: группы, фасовки, две сортировки. Группы и первая страница приходят с сервера */
export function SzptPage({ group: slug }: { group: string }) {
  const { t } = useTranslation()
  const href = useHref()
  const pathname = usePathname()
  const params = useSearchParams()

  const groups = useSzptGroups()
  const group = groups.data?.find((g) => g.slug === slug)
  const state = group ? readSzptState(params, group) : { group: slug, sizes: [], sort: 'price_asc' as const }
  // Без группы (не загрузилась или неизвестна) запрос не нужен — уйдём в 404 или подождём список групп
  const products = useSzptPages({ group: state.group, sizes: state.sizes, sort: state.sort }, Boolean(group))

  if (groups.isSuccess && !group) return <NotFoundPage />
  if (groups.isPending)
    return (
      <LoadingState>
        <CategoryPageSkeleton />
      </LoadingState>
    )
  if (groups.isError || !group) return <ErrorState onRetry={() => groups.refetch()} />

  const update = (next: Pick<typeof state, 'sizes' | 'sort'>) => replaceQuery(pathname, szptParams(next))
  const toggleSize = (size: number) =>
    update({
      sort: state.sort,
      sizes: state.sizes.includes(size) ? state.sizes.filter((s) => s !== size) : [...state.sizes, size],
    })
  const items = products.data?.pages.flat() ?? []
  const unit = t(`szpt.per.${group.unit}`)

  return (
    <>
      <div className="flex items-center gap-4">
        <BackLink fallbackHref={href('/catalog')} />
        <nav aria-label={t('category.breadcrumbs')} className="text-sm text-muted">
          <Link href={href('/catalog')} className="hover:text-ink">
            {t('nav.home')}
          </Link>
        </nav>
      </div>
      <h1 className="mt-3 text-h1">{t('szpt.title')}</h1>
      <p className="mt-2 text-sm text-muted">
        {t('szpt.subtitle')}
        {items[0] && <> {t('szpt.priceDate', { date: formatDate(items[0].snapshotAt) })}</>}
      </p>

      <nav aria-label={t('szpt.groupsLabel')} className="-mx-4 mt-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2 md:flex-wrap">
          {groups.data.map((g) => (
            <li key={g.slug} className="shrink-0">
              <Link
                href={href(`/szpt/${g.slug}`)}
                prefetch={false}
                data-testid={`szpt-group-${g.slug}`}
                aria-current={g.slug === slug ? 'page' : undefined}
                className={chipClass(g.slug === slug)}
              >
                {szptGroupName(t, g)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div role="group" aria-label={t('szpt.size')} className="flex flex-wrap gap-2">
          {group.sizes.map((size) => (
            <Chip
              key={size}
              testId={`szpt-size-${size}`}
              pressed={state.sizes.includes(size)}
              onClick={() => toggleSize(size)}
            >
              {formatPackSize(size, group.unit, t)}
            </Chip>
          ))}
        </div>
        <div role="group" aria-label={t('szpt.sortLabel')} className="flex shrink-0 gap-2">
          {SORTS.map((sort) => (
            <Chip
              key={sort}
              testId={`szpt-sort-${sort}`}
              pressed={state.sort === sort}
              onClick={() => update({ sizes: state.sizes, sort })}
            >
              {t(`szpt.sort.${sort}`, { unit })}
            </Chip>
          ))}
        </div>
      </div>

      <section aria-labelledby="szpt-results-title" className="mt-6">
        <h2 id="szpt-results-title" className="mb-4 text-h2">
          {szptGroupName(t, group)}
        </h2>
        {products.isPending && (
          <LoadingState>
            <ProductGridSkeleton count={8} wide />
          </LoadingState>
        )}
        {products.isError && <ErrorState onRetry={() => products.refetch()} />}
        {products.isSuccess && items.length === 0 && (
          <EmptyState
            title={t(state.sizes.length > 0 ? 'szpt.emptyFiltered' : 'szpt.empty')}
            icon={state.sizes.length > 0 ? 'sliders' : 'basket'}
            action={
              state.sizes.length > 0 && (
                <Button onClick={() => update({ sizes: [], sort: state.sort })}>{t('szpt.resetSizes')}</Button>
              )
            }
          />
        )}
        {items.length > 0 && (
          <div
            aria-busy={products.isPlaceholderData}
            className={`transition-opacity ${products.isPlaceholderData ? 'opacity-50' : ''}`}
          >
            <ProductGrid products={items} wide />
          </div>
        )}
        {products.hasNextPage && (
          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => products.fetchNextPage()}
              disabled={products.isFetchingNextPage}
              testId="load-more"
              className="w-full md:w-auto"
            >
              {t(products.isFetchingNextPage ? 'state.loading' : 'category.loadMore')}
            </Button>
          </div>
        )}
      </section>
    </>
  )
}
