import Link from 'next/link'
import { blogPagePath } from '../../content/blog'
import { getI18n, type Language } from '../../i18n'
import { localePath } from '../../lib/paths'

const itemClass = 'inline-flex h-10 min-w-10 items-center justify-center rounded-control px-3 text-sm font-medium transition-colors'

/** Обычные ссылки на страницы ленты — их видит и поисковик */
export function Pagination({ lang, page, total }: { lang: Language; page: number; total: number }) {
  if (total <= 1) return null
  const { t } = getI18n(lang)
  const href = (p: number) => localePath(lang, blogPagePath(p))
  const pages = Array.from({ length: total }, (_, i) => i + 1)

  return (
    <nav aria-label={t('blog.pagination')} className="mt-8 flex flex-wrap items-center gap-1.5">
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" className={`${itemClass} border border-line bg-card hover:bg-surface`}>
          ← {t('blog.prevPage')}
        </Link>
      )}
      {pages.map((p) =>
        p === page ? (
          <span key={p} aria-current="page" className={`${itemClass} bg-ink text-card`}>
            {p}
          </span>
        ) : (
          <Link key={p} href={href(p)} className={`${itemClass} border border-line bg-card hover:bg-surface`}>
            {p}
          </Link>
        ),
      )}
      {page < total && (
        <Link href={href(page + 1)} rel="next" className={`${itemClass} border border-line bg-card hover:bg-surface`}>
          {t('blog.nextPage')} →
        </Link>
      )}
    </nav>
  )
}
