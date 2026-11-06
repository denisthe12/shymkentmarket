import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUTHORS,
  blogPagePath,
  getPost,
  getPosts,
  getPostsPage,
  getRelatedPosts,
  getToc,
  headingId,
  navTitle,
  POSTS_PER_PAGE,
  readingMinutes,
  totalPages,
} from '.'
import { parseInline } from '../../lib/inlineMarkup'
import { PHOTO_QUERIES } from './photo-queries'
import type { Block } from './types'

const posts = getPosts()
const publicDir = join(__dirname, '..', '..', '..', 'public')
const categorySlugs = ['bread', 'dairy', 'eggs', 'groats', 'meat', 'milk', 'oil', 'sugar', 'vegetables']

/** Все внутренние ссылки из текста статьи */
function internalLinks(blocks: Block[]): string[] {
  const texts = blocks.flatMap((b) => (b.type === 'p' || b.type === 'callout' ? [b.text] : b.type === 'ul' || b.type === 'ol' ? b.items : []))
  return texts.flatMap(parseInline).flatMap((n) => (n.kind === 'link' && !n.external ? [n.href] : []))
}

describe('blog content', () => {
  it('has 60 posts: 30 in Russian and 30 in Kazakh, editorial writes 20–30%', () => {
    expect(posts).toHaveLength(60)
    expect(posts.filter((p) => p.lang === 'ru')).toHaveLength(30)
    expect(posts.filter((p) => p.lang === 'kk')).toHaveLength(30)
    const editorial = posts.filter((p) => p.authorId === 'editorial').length / posts.length
    expect(editorial).toBeGreaterThanOrEqual(0.2)
    expect(editorial).toBeLessThanOrEqual(0.3)
  })

  it('gives every post a unique address, a known author and sources', () => {
    expect(new Set(posts.map((p) => `${p.lang}/${p.slug}`)).size).toBe(posts.length)
    for (const post of posts) {
      expect(AUTHORS.some((a) => a.id === post.authorId), post.slug).toBe(true)
      expect(post.blocks.some((b) => b.type === 'sources'), post.slug).toBe(true)
      expect(post.updated >= post.published, post.slug).toBe(true)
    }
  })

  it('keeps descriptions short enough for search snippets', () => {
    for (const post of posts) expect(post.description.length, post.slug).toBeLessThanOrEqual(160)
  })

  it('links only to pages that exist, in the right language', () => {
    for (const post of posts)
      for (const href of internalLinks(post.blocks)) {
        const [, lang, section, slug] = href.split('/')
        expect(['ru', 'kk'], href).toContain(lang)
        if (section === 'blog') expect(getPost(lang as 'ru' | 'kk', slug), `${post.slug} → ${href}`).toBeDefined()
        else if (section === 'collections') expect(categorySlugs, href).toContain(slug)
        else expect(['catalog', 'dashboard'], href).toContain(section)
      }
  })

  it('uses each stock photo once and has an Open Graph image for every post', () => {
    const photos = posts.flatMap((p) => p.blocks.flatMap((b) => (b.type === 'image' ? [b.photo] : [])))
    expect(new Set(photos).size).toBe(photos.length)
    for (const id of photos) expect(PHOTO_QUERIES[id], id).toBeDefined()
    for (const post of posts) expect(existsSync(join(publicDir, 'blog', 'og', post.lang, `${post.slug}.png`)), post.slug).toBe(true)
  })

  it('builds a table of contents with unique anchors', () => {
    for (const post of posts) {
      const ids = getToc(post).map((item) => item.id)
      expect(new Set(ids).size, post.slug).toBe(ids.length)
    }
    expect(headingId('Что дальше?')).toBe('что-дальше')
  })

  it('orders newest first and shortens titles for the sidebar', () => {
    const dates = posts.map((p) => p.published)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(navTitle({ ...posts[0], shortTitle: undefined, title: 'Главное: подробности' })).toBe('Главное')
  })

  it('splits the feed into pages of 10 without gaps or repeats', () => {
    expect(totalPages()).toBe(6)
    const paged = Array.from({ length: totalPages() }, (_, i) => getPostsPage(i + 1)).flat()
    expect(paged).toEqual(posts)
    expect(getPostsPage(1)).toHaveLength(POSTS_PER_PAGE)
    expect(getPostsPage(7)).toEqual([])
    expect(blogPagePath(1)).toBe('/blog')
    expect(blogPagePath(3)).toBe('/blog/page/3')
  })

  it('suggests related posts without the current one', () => {
    const related = getRelatedPosts(posts[0])
    expect(related).toHaveLength(3)
    expect(related).not.toContain(posts[0])
    expect(readingMinutes(posts[0])).toBeGreaterThan(0)
  })
})

describe('parseInline', () => {
  it('splits bold text and internal and external links', () => {
    expect(parseInline('Цена **430 ₸** в [каталоге](/ru/catalog), см. [БНС](https://stat.gov.kz)')).toEqual([
      { kind: 'text', text: 'Цена ' },
      { kind: 'strong', text: '430 ₸' },
      { kind: 'text', text: ' в ' },
      { kind: 'link', text: 'каталоге', href: '/ru/catalog', external: false },
      { kind: 'text', text: ', см. ' },
      { kind: 'link', text: 'БНС', href: 'https://stat.gov.kz', external: true },
    ])
  })
})
