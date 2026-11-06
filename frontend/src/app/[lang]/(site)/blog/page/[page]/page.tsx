import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { JsonLd } from '../../../../../../components/seo/JsonLd'
import { blogPagePath, totalPages } from '../../../../../../content/blog'
import { getI18n, isLanguage } from '../../../../../../i18n'
import { localePath } from '../../../../../../lib/paths'
import { pageMetadata } from '../../../../../../lib/seo'
import { breadcrumbJsonLd } from '../../../../../../lib/structuredData'
import { BlogIndexPage } from '../../../../../../views/BlogIndexPage'

// Страницы ленты со второй: /blog/page/2 … Первая — это /blog
export const generateStaticParams = () =>
  Array.from({ length: totalPages() - 1 }, (_, i) => ({ page: String(i + 2) }))

/** Номер страницы из URL: только целое ≥ 1 без ведущих нулей */
function parsePage(raw: string): number | null {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null
}

export async function generateMetadata({ params }: PageProps<'/[lang]/blog/page/[page]'>): Promise<Metadata> {
  const { lang, page: raw } = await params
  const page = parsePage(raw)
  if (!isLanguage(lang) || !page || page > totalPages()) return {}
  const { t } = getI18n(lang)
  return pageMetadata({
    lang,
    path: blogPagePath(page),
    title: `${t('blog.title')} · ${t('blog.page', { page })}`,
    description: t('meta.blog'),
  })
}

export default async function Page({ params }: PageProps<'/[lang]/blog/page/[page]'>) {
  const { lang, page: raw } = await params
  if (!isLanguage(lang)) notFound()
  const page = parsePage(raw)
  if (page === 1) permanentRedirect(localePath(lang, '/blog'))
  if (!page || page > totalPages()) notFound()
  const { t } = getI18n(lang)
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(lang, [
          { name: t('nav.home'), path: '/catalog' },
          { name: t('blog.title'), path: '/blog' },
          { name: t('blog.page', { page }), path: blogPagePath(page) },
        ])}
      />
      <BlogIndexPage lang={lang} page={page} />
    </>
  )
}
