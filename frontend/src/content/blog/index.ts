import type { Language } from '../../i18n/languages'
import { AUTHORS } from './authors'
import { POSTS } from './posts'
import type { Author, Post } from './types'

export type { Author, Block, ChartSpec, Post, PostCategory, RichText } from './types'
export { AUTHORS } from './authors'
export { isIndexable, PRICES_ARE_PLACEHOLDER } from './data'

/** Стабильный псевдослучайный ключ из slug: порядок «вперемешку», но одинаковый между сборками */
function shuffleKey(slug: string): number {
  let h = 2166136261
  for (const char of slug) h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0
  return h
}

/**
 * Все статьи блога, на обоих языках вперемешку: новые сверху, внутри одной даты — перемешаны.
 * Каждая статья открывается по адресу своего языка (Post.lang)
 */
export function getPosts(): Post[] {
  return [...POSTS].sort((a, b) => b.published.localeCompare(a.published) || shuffleKey(a.slug) - shuffleKey(b.slug))
}

/** Статей на одной странице ленты */
export const POSTS_PER_PAGE = 10

export const totalPages = () => Math.max(1, Math.ceil(POSTS.length / POSTS_PER_PAGE))

/** Страница ленты (с 1). Несуществующая — пустой список */
export function getPostsPage(page: number): Post[] {
  return getPosts().slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE)
}

/** Адрес страницы ленты без префикса языка: 1 → '/blog', 2 → '/blog/page/2' */
export const blogPagePath = (page: number) => (page === 1 ? '/blog' : `/blog/page/${page}`)

export function getPost(lang: Language, slug: string): Post | undefined {
  return POSTS.find((post) => post.lang === lang && post.slug === slug)
}

/** Адрес статьи без префикса языка берёт localePath(post.lang, …) */
export const postPath = (post: Post) => `/blog/${post.slug}`

export function getAuthor(id: string): Author | undefined {
  return AUTHORS.find((author) => author.id === id)
}

export function getPostsByAuthor(authorId: string): Post[] {
  return getPosts().filter((post) => post.authorId === authorId)
}

/** Похожие: та же рубрика на том же языке, потом та же рубрика на другом, потом остальные */
export function getRelatedPosts(post: Post, count = 3): Post[] {
  const others = getPosts().filter((p) => p.slug !== post.slug)
  const score = (p: Post) => (p.category === post.category ? 0 : 2) + (p.lang === post.lang ? 0 : 1)
  return others.sort((a, b) => score(a) - score(b)).slice(0, count)
}

/** Короткое название для боковой навигации */
export const navTitle = (post: Post) => post.shortTitle ?? post.title.split(':')[0]

/** id заголовка для якорей оглавления: «Что дальше?» → «что-дальше» (кириллица остаётся) */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

export type TocItem = { id: string; text: string; level: 2 | 3 }

/** Оглавление статьи: заголовки h2/h3 по порядку */
export function getToc(post: Post): TocItem[] {
  return post.blocks.flatMap((block): TocItem[] =>
    block.type === 'h2' || block.type === 'h3'
      ? [{ id: headingId(block.text), text: block.text, level: block.type === 'h2' ? 2 : 3 }]
      : [],
  )
}

/** Минут на чтение: ~180 слов в минуту, не меньше одной */
export function readingMinutes(post: Post): number {
  const text = post.blocks
    .map((block) => {
      switch (block.type) {
        case 'h2':
        case 'h3':
        case 'p':
        case 'callout':
          return block.text
        case 'ul':
        case 'ol':
          return block.items.join(' ')
        case 'table':
          return block.rows.flat().join(' ')
        default:
          return ''
      }
    })
    .join(' ')
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 180))
}
