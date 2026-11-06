import { BlogSidebar } from '../components/blog/BlogSidebar'
import { Pagination } from '../components/blog/Pagination'
import { PostPreview } from '../components/blog/PostCard'
import { getPostsPage, totalPages } from '../content/blog'
import { getI18n, type Language } from '../i18n'

/** Лента блога: слева список статей, по центру — анонсы одной страницы (статьи обоих языков вперемешку) */
export function BlogIndexPage({ lang, page = 1 }: { lang: Language; page?: number }) {
  const { t } = getI18n(lang)
  return (
    <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10">
      <aside>
        <BlogSidebar lang={lang} />
      </aside>
      <div className="max-w-[720px]">
        <header className="mb-8">
          <h1 className="text-h1">
            {t('blog.title')}
            {page > 1 && <span className="text-muted"> · {t('blog.page', { page })}</span>}
          </h1>
          {page === 1 && <p className="mt-2 text-muted">{t('blog.lead')}</p>}
        </header>
        {getPostsPage(page).map((post) => (
          <PostPreview key={`${post.lang}/${post.slug}`} post={post} lang={lang} />
        ))}
        <Pagination lang={lang} page={page} total={totalPages()} />
      </div>
    </div>
  )
}
