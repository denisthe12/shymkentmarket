import Link from 'next/link'
import { getPosts, navTitle, postPath } from '../../content/blog'
import { getI18n, type Language } from '../../i18n'
import { localePath } from '../../lib/paths'

/** Список всех статей короткими названиями; текущая — выделена */
function PostList({ lang, current }: { lang: Language; current?: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {getPosts().map((post) => {
        const active = post.lang === lang && post.slug === current
        return (
          <li key={`${post.lang}/${post.slug}`}>
            <Link
              href={localePath(post.lang, postPath(post))}
              hrefLang={post.lang}
              aria-current={active ? 'page' : undefined}
              className={`block rounded-md px-2 py-1.5 text-meta transition-colors ${
                active ? 'bg-card font-medium text-ink shadow-[inset_2px_0_0_var(--color-ink)]' : 'text-muted hover:bg-card hover:text-ink'
              }`}
            >
              <span lang={post.lang}>{navTitle(post)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Левая колонка блога. На широком экране — липкая колонка со своей прокруткой,
 * на узком — сворачиваемый список над статьёй
 */
export function BlogSidebar({ lang, current }: { lang: Language; current?: string }) {
  const { t } = getI18n(lang)
  return (
    <>
      <details className="rounded-card border border-line bg-card lg:hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t('blog.allPostsNav')}</summary>
        <nav aria-label={t('blog.allPostsNav')} className="max-h-[60vh] overflow-y-auto px-2 pb-3">
          <PostList lang={lang} current={current} />
        </nav>
      </details>
      <nav
        aria-label={t('blog.allPostsNav')}
        className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto pr-2 lg:block"
      >
        <p className="mb-2 px-2 text-sm font-semibold">
          <Link href={localePath(lang, '/blog')} className="hover:underline">
            {t('blog.allPostsNav')}
          </Link>
        </p>
        <PostList lang={lang} current={current} />
      </nav>
    </>
  )
}
