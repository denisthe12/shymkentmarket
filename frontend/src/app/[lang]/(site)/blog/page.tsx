import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '../../../../components/seo/JsonLd'
import { getI18n, isLanguage } from '../../../../i18n'
import { pageMetadata } from '../../../../lib/seo'
import { breadcrumbJsonLd } from '../../../../lib/structuredData'
import { BlogIndexPage } from '../../../../views/BlogIndexPage'

// Статьи лежат в репозитории (content/blog) — страница статическая, собирается при build

export async function generateMetadata({ params }: PageProps<'/[lang]/blog'>): Promise<Metadata> {
  const { lang } = await params
  if (!isLanguage(lang)) return {}
  const { t } = getI18n(lang)
  return pageMetadata({ lang, path: '/blog', title: t('blog.title'), description: t('meta.blog') })
}

export default async function Page({ params }: PageProps<'/[lang]/blog'>) {
  const { lang } = await params
  if (!isLanguage(lang)) notFound()
  const { t } = getI18n(lang)
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(lang, [
          { name: t('nav.home'), path: '/catalog' },
          { name: t('blog.title'), path: '/blog' },
        ])}
      />
      <BlogIndexPage lang={lang} />
    </>
  )
}
