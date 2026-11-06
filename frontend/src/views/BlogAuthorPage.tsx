import Link from 'next/link'
import { AuthorAvatar, AuthorLinks } from '../components/blog/AuthorCard'
import { BlogSidebar } from '../components/blog/BlogSidebar'
import { PostPreview } from '../components/blog/PostCard'
import { getPostsByAuthor, type Author } from '../content/blog'
import { getI18n, type Language } from '../i18n'
import { localePath } from '../lib/paths'

export function BlogAuthorPage({ author, lang }: { author: Author; lang: Language }) {
  const { t } = getI18n(lang)
  const posts = getPostsByAuthor(author.id)
  return (
    <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10">
      <aside>
        <BlogSidebar lang={lang} />
      </aside>
      <div className="min-w-0 max-w-[720px]">
      <nav aria-label={t('blog.breadcrumbs')} className="mb-4 text-meta text-muted">
        <Link href={localePath(lang, '/blog')} className="hover:text-ink hover:underline">
          {t('blog.title')}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{t('blog.authors')}</span>
      </nav>
      <header className="flex max-w-[60ch] flex-col gap-4 sm:flex-row sm:items-start">
        <AuthorAvatar author={author} lang={lang} size="lg" />
        <div className="flex flex-col gap-2">
          <h1 className="text-h1">{author.name[lang]}</h1>
          <p className="text-muted">{author.role[lang]}</p>
          <p>{author.bio[lang]}</p>
          <AuthorLinks author={author} />
        </div>
      </header>
      <h2 className="mt-10 mb-2 border-b border-line pb-3 text-h2">{t('blog.postsByAuthor')}</h2>
      {posts.map((post) => (
        <PostPreview key={`${post.lang}/${post.slug}`} post={post} lang={lang} />
      ))}
      </div>
    </div>
  )
}
