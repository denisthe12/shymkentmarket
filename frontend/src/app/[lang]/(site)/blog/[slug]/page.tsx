import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '../../../../../components/seo/JsonLd'
import { getAuthor, getPost, getPosts, isIndexable } from '../../../../../content/blog'
// getPosts() — все статьи; страницы строим только для статей этого языка
import { getI18n, isLanguage } from '../../../../../i18n'
import { pageMetadata } from '../../../../../lib/seo'
import { blogPostingJsonLd, breadcrumbJsonLd } from '../../../../../lib/structuredData'
import { BlogPostPage } from '../../../../../views/BlogPostPage'

// Статья есть только на своём языке: /kk/blog/<русская статья> → 404
export function generateStaticParams({ params }: { params: { lang: string } }) {
  return getPosts()
    .filter((post) => post.lang === params.lang)
    .map((post) => ({ slug: post.slug }))
}

/** Картинка для соцсетей — scripts/generate-blog-og.mjs */
const ogImage = (lang: string, slug: string) => `/blog/og/${lang}/${slug}.png`

export async function generateMetadata({ params }: PageProps<'/[lang]/blog/[slug]'>): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLanguage(lang)) return {}
  const post = getPost(lang, slug)
  if (!post) return {}
  const { t } = getI18n(lang)
  const author = getAuthor(post.authorId)
  const metadata = pageMetadata({
    lang,
    path: `/blog/${slug}`,
    title: post.title,
    description: post.description,
    image: ogImage(lang, slug),
    singleLanguage: true,
    article: {
      publishedTime: post.published,
      modifiedTime: post.updated,
      authors: author ? [author.name[lang]] : [],
      section: t(`blog.categories.${post.category}`),
    },
  })
  // Цены сетей в статье пока предварительные — не индексируем, но ссылки из неё учитываются
  return isIndexable(post) ? metadata : { ...metadata, robots: { index: false, follow: true } }
}

export default async function Page({ params }: PageProps<'/[lang]/blog/[slug]'>) {
  const { lang, slug } = await params
  if (!isLanguage(lang)) notFound()
  const post = getPost(lang, slug)
  if (!post) notFound()
  const { t } = getI18n(lang)

  return (
    <>
      <JsonLd data={blogPostingJsonLd(post, getAuthor(post.authorId), ogImage(lang, slug))} />
      <JsonLd
        data={breadcrumbJsonLd(lang, [
          { name: t('nav.home'), path: '/catalog' },
          { name: t('blog.title'), path: '/blog' },
          { name: post.title, path: `/blog/${slug}` },
        ])}
      />
      <BlogPostPage post={post} />
    </>
  )
}
