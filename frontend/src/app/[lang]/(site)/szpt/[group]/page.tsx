import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { szptGroupsQuery, szptProductPagesQuery } from '../../../../../api/queries'
import { getSzptGroups, toSearchParams } from '../../../../../api/server'
import { JsonLd } from '../../../../../components/seo/JsonLd'
import { getI18n, isLanguage } from '../../../../../i18n'
import { szptGroupName } from '../../../../../lib/dataLabels'
import { pageMetadata } from '../../../../../lib/seo'
import { breadcrumbJsonLd } from '../../../../../lib/structuredData'
import { readSzptState } from '../../../../../lib/szpt'
import { SzptPage } from '../../../../../views/SzptPage'

export async function generateMetadata({ params }: PageProps<'/[lang]/szpt/[group]'>): Promise<Metadata> {
  const { lang, group: slug } = await params
  const group = (await getSzptGroups()).find((g) => g.slug === slug)
  if (!group || !isLanguage(lang)) return {}
  // canonical — без фасовок и сортировки, как у категорий
  const { t } = getI18n(lang)
  const name = szptGroupName(t, group)
  return pageMetadata({
    lang,
    path: `/szpt/${slug}`,
    title: `${name} — ${t('szpt.title')}`,
    description: t('meta.szpt', { name }),
  })
}

// Фасовки и сортировка из URL — в HTML сразу нужный список; дальше всё на клиенте
export default async function Page({ params, searchParams }: PageProps<'/[lang]/szpt/[group]'>) {
  const { lang, group: slug } = await params
  if (!isLanguage(lang)) notFound()
  const groups = await getSzptGroups()
  const group = groups.find((g) => g.slug === slug)
  if (!group) notFound()

  const queryClient = new QueryClient()
  queryClient.setQueryData(szptGroupsQuery().queryKey, groups)
  // Тот же readSzptState, что на клиенте, — ключи запроса совпадут. prefetch не бросает: если фасовка из ссылки
  // пропала в новом снимке раньше, чем обновился кэш групп, страница отрисуется, а ошибку покажет список
  await queryClient.prefetchInfiniteQuery(szptProductPagesQuery(readSzptState(toSearchParams(await searchParams), group)))

  const { t } = getI18n(lang)
  const crumbs = [
    { name: t('nav.home'), path: '/catalog' },
    { name: szptGroupName(t, group), path: `/szpt/${slug}` },
  ]
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <JsonLd data={breadcrumbJsonLd(lang, crumbs)} />
      <SzptPage group={slug} />
    </HydrationBoundary>
  )
}
