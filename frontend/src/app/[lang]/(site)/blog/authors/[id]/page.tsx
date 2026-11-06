import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '../../../../../../components/seo/JsonLd'
import { AUTHORS, getAuthor } from '../../../../../../content/blog'
import { isLanguage } from '../../../../../../i18n'
import { pageMetadata } from '../../../../../../lib/seo'
import { authorPageJsonLd } from '../../../../../../lib/structuredData'
import { BlogAuthorPage } from '../../../../../../views/BlogAuthorPage'

export const generateStaticParams = () => AUTHORS.map((author) => ({ id: author.id }))

export async function generateMetadata({ params }: PageProps<'/[lang]/blog/authors/[id]'>): Promise<Metadata> {
  const { lang, id } = await params
  const author = getAuthor(id)
  if (!isLanguage(lang) || !author) return {}
  return pageMetadata({
    lang,
    path: `/blog/authors/${id}`,
    title: author.name[lang],
    description: `${author.role[lang]}. ${author.bio[lang]}`,
  })
}

export default async function Page({ params }: PageProps<'/[lang]/blog/authors/[id]'>) {
  const { lang, id } = await params
  if (!isLanguage(lang)) notFound()
  const author = getAuthor(id)
  if (!author) notFound()
  return (
    <>
      <JsonLd data={authorPageJsonLd(lang, author)} />
      <BlogAuthorPage author={author} lang={lang} />
    </>
  )
}
