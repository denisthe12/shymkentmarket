import Link from 'next/link'
import type { Author } from '../../content/blog'
import { getI18n, type Language } from '../../i18n'
import { localePath } from '../../lib/paths'
import { LogoMark } from '../layout/Logo'

// Пастель плиток категорий: у каждого автора свой фон аватара (по id — стабильно между сборками)
const AVATAR_BG = ['bg-tile-1', 'bg-tile-2', 'bg-tile-3', 'bg-tile-4', 'bg-tile-5']

function hash(text: string): number {
  let h = 0
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0
  return h
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')

export function AuthorAvatar({ author, lang, size = 'md' }: { author: Author; lang: Language; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'size-8 text-caption', md: 'size-12 text-sm', lg: 'size-20 text-h2' }[size]
  if (author.kind === 'organization')
    return (
      <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-card`} aria-hidden="true">
        <LogoMark className="size-1/2" />
      </span>
    )
  return (
    <span
      className={`${box} ${AVATAR_BG[hash(author.id) % AVATAR_BG.length]} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink`}
      aria-hidden="true"
    >
      {initials(author.name[lang])}
    </span>
  )
}

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.77 2.6 4.77 6v5.55h-4v-4.92c0-1.17-.02-2.68-1.66-2.68-1.66 0-1.92 1.28-1.92 2.6v5h-4v-11Z" />
  </svg>
)

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
  </svg>
)

/** Ссылки на профили. compact — только иконки (под заголовком статьи) */
export function AuthorLinks({ author, compact = false }: { author: Author; compact?: boolean }) {
  if (!author.links) return null
  const { linkedin, github } = author.links
  if (compact)
    return (
      <div className="flex items-center gap-1">
        {linkedin && (
          <a href={linkedin} target="_blank" rel="noopener noreferrer nofollow" aria-label="LinkedIn" className="rounded-md p-1.5 text-muted transition-colors hover:bg-card hover:text-ink">
            <LinkedInIcon />
          </a>
        )}
        {github && (
          <a href={github} target="_blank" rel="noopener noreferrer nofollow" aria-label="GitHub" className="rounded-md p-1.5 text-muted transition-colors hover:bg-card hover:text-ink">
            <GitHubIcon />
          </a>
        )}
      </div>
    )
  const linkClass = 'inline-flex items-center gap-1.5 rounded-control border border-line bg-card px-2.5 py-1 text-meta text-ink transition-colors hover:bg-surface'
  return (
    <div className="flex flex-wrap gap-2">
      {linkedin && (
        <a href={linkedin} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
          <LinkedInIcon />
          LinkedIn
        </a>
      )}
      {github && (
        <a href={github} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
          <GitHubIcon />
          GitHub
        </a>
      )}
    </div>
  )
}

/** Блок «Об авторе» под статьёй */
export function AuthorCard({ author, lang }: { author: Author; lang: Language }) {
  const { t } = getI18n(lang)
  return (
    <section className="mt-10 flex gap-4 rounded-card border border-line bg-card p-5" aria-label={t('blog.aboutAuthor')}>
      <AuthorAvatar author={author} lang={lang} />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-caption text-muted">{t('blog.aboutAuthor')}</p>
        <p>
          <Link href={localePath(lang, `/blog/authors/${author.id}`)} className="text-h3 hover:underline">
            {author.name[lang]}
          </Link>
          <span className="block text-meta text-muted">{author.role[lang]}</span>
        </p>
        <p className="text-sm">{author.bio[lang]}</p>
        <AuthorLinks author={author} />
      </div>
    </section>
  )
}
