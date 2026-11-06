import Link from 'next/link'
import { getAuthor, postPath, readingMinutes, type Post } from '../../content/blog'
import { getI18n, type Language } from '../../i18n'
import { formatDate } from '../../lib/format'
import { localePath } from '../../lib/paths'
import { AuthorAvatar } from './AuthorCard'

/**
 * Рубрика, дата и время чтения — одной строкой. Подписи — на языке страницы (lang).
 * showUpdated — на странице статьи: дата обновления, если она позже публикации
 */
export function PostMeta({ post, lang, showUpdated = false }: { post: Post; lang: Language; showUpdated?: boolean }) {
  const { t } = getI18n(lang)
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
      <span className="rounded-full bg-card px-2 py-0.5 text-caption font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]">
        {t(`blog.categories.${post.category}`)}
      </span>
      <time dateTime={post.published}>{formatDate(post.published)}</time>
      {showUpdated && post.updated > post.published && (
        <span>
          · {t('blog.updated')} <time dateTime={post.updated}>{formatDate(post.updated)}</time>
        </span>
      )}
      <span aria-hidden="true">·</span>
      <span>{t('blog.readingTime', { count: readingMinutes(post) })}</span>
    </p>
  )
}

/** Автор под заголовком: аватар, имя (ссылка на страницу автора), роль */
export function PostByline({ post, lang }: { post: Post; lang: Language }) {
  const author = getAuthor(post.authorId)
  if (!author) return null
  return (
    <p className="flex items-center gap-2.5 text-meta">
      <AuthorAvatar author={author} lang={lang} size="sm" />
      <span className="flex flex-col">
        <Link href={localePath(lang, `/blog/authors/${author.id}`)} className="font-medium text-ink hover:underline">
          {author.name[lang]}
        </Link>
        <span className="text-caption text-muted">{author.role[lang]}</span>
      </span>
    </p>
  )
}

/**
 * Анонс статьи в ленте — без карточки, разделитель снизу.
 * Лента общая для обоих языков: заголовок и анонс — на языке статьи, подписи — на языке страницы
 */
export function PostPreview({ post, lang }: { post: Post; lang: Language }) {
  const { t } = getI18n(lang)
  const href = localePath(post.lang, postPath(post))
  return (
    <article className="flex flex-col gap-3 border-b border-line py-8 first:pt-0 last:border-b-0">
      <PostMeta post={post} lang={lang} />
      <div lang={post.lang} className="flex flex-col gap-2">
        <h2 className="text-h2">
          <Link href={href} hrefLang={post.lang} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        <p className="text-muted">{post.description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PostByline post={post} lang={lang} />
        <Link href={href} hrefLang={post.lang} className="text-meta font-medium text-ink hover:underline" aria-hidden="true" tabIndex={-1}>
          {t('blog.readMore')} →
        </Link>
      </div>
    </article>
  )
}
