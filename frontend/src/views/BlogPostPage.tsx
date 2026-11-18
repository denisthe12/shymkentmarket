import Link from 'next/link'
import { ArticleBlocks } from '../components/blog/ArticleBlocks'
import { AuthorCard, AuthorLinks } from '../components/blog/AuthorCard'
import { BlogSidebar } from '../components/blog/BlogSidebar'
import { PostByline, PostMeta } from '../components/blog/PostCard'
import { TocPanel } from '../components/blog/TableOfContents'
import { Button } from '../components/ui/Button'
import { getAuthor, getRelatedPosts, getToc, isIndexable, navTitle, postPath, type Post } from '../content/blog'
import { getI18n } from '../i18n'
import { localePath } from '../lib/paths'

/** Статья: слева — все статьи, по центру — текст, справа — оглавление */
export function BlogPostPage({ post }: { post: Post }) {
  const { lang } = post
  const { t } = getI18n(lang)
  const author = getAuthor(post.authorId)
  const toc = getToc(post)

  return (
    <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)_190px] lg:gap-8 xl:gap-10">
      <aside>
        <BlogSidebar lang={lang} current={post.slug} />
      </aside>

      <article className="min-w-0 max-w-[720px]">
        <nav aria-label={t('blog.breadcrumbs')} className="mb-4 text-meta text-muted">
          <Link href={localePath(lang, '/blog')} className="hover:text-ink hover:underline">
            {t('blog.title')}
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{t(`blog.categories.${post.category}`)}</span>
        </nav>
        <header className="flex flex-col gap-4 border-b border-line pb-6">
          <h1 className="text-h1">{post.title}</h1>
          <PostMeta post={post} lang={lang} showUpdated />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <PostByline post={post} lang={lang} />
            {author && <AuthorLinks author={author} compact />}
          </div>
          <p className="text-[17px] leading-6.5 text-muted">{post.description}</p>
        </header>

        {!isIndexable(post) && (
          <p role="note" className="mt-6 rounded-card border border-line bg-surface p-4 text-sm text-muted">
            {t('blog.placeholderNotice')}
          </p>
        )}

        <div className="mt-6 lg:hidden">
          <TocPanel items={toc} label={t('blog.toc')} />
        </div>

        <ArticleBlocks blocks={post.blocks} lang={lang} />

        <aside className="mt-10 flex flex-col items-start gap-3 rounded-card bg-accent-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{t('blog.ctaTitle')}</p>
            <p className="text-sm text-muted">{t('blog.ctaText')}</p>
          </div>
          <Button href={localePath(lang, '/catalog')} variant="primary" className="shrink-0">
            {t('blog.ctaButton')}
          </Button>
        </aside>

        {author && <AuthorCard author={author} lang={lang} />}

        <section className="mt-10" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-3 text-h3">
            {t('blog.related')}
          </h2>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {getRelatedPosts(post).map((p) => (
              <li key={`${p.lang}/${p.slug}`}>
                <Link
                  href={localePath(p.lang, postPath(p))}
                  hrefLang={p.lang}
                  lang={p.lang}
                  className="flex items-center justify-between gap-3 py-3 font-medium hover:underline"
                >
                  {navTitle(p)}
                  <span aria-hidden="true" className="text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>

      <aside className="hidden lg:block">
        <TocPanel items={toc} label={t('blog.toc')} />
      </aside>
    </div>
  )
}
