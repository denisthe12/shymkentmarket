import { describe, expect, it } from 'vitest'
import { localePath, navSection, stripLanguage, switchLanguagePath } from './paths'

describe('paths', () => {
  it('prefixes a path with the language', () => {
    expect(localePath('ru', '/')).toBe('/ru')
    expect(localePath('kk', '/catalog')).toBe('/kk/catalog')
    expect(localePath('kk', '/products/p1')).toBe('/kk/products/p1')
  })

  it('swaps the language prefix keeping the rest of the path', () => {
    expect(switchLanguagePath('/ru', 'kk')).toBe('/kk')
    expect(switchLanguagePath('/ru/collections/milk', 'kk')).toBe('/kk/collections/milk')
    expect(switchLanguagePath('/kk/search', 'ru')).toBe('/ru/search')
  })

  it('leads from a blog post to the blog of the other language: posts exist in one language only', () => {
    expect(switchLanguagePath('/ru/blog/gde-deshevle-produkty-aktau', 'kk')).toBe('/kk/blog')
    expect(switchLanguagePath('/ru/blog', 'kk')).toBe('/kk/blog')
    expect(switchLanguagePath('/kk/blog/authors/editorial', 'ru')).toBe('/ru/blog/authors/editorial')
  })

  it('leaves paths without a language prefix as they are', () => {
    expect(stripLanguage('/catalog')).toBe('/catalog')
    expect(stripLanguage('/ru/catalog')).toBe('/catalog')
  })

  it('maps a page to its navigation section', () => {
    expect(navSection('/ru/catalog')).toBe('catalog')
    expect(navSection('/kk/collections/milk')).toBe('catalog')
    expect(navSection('/ru/products/p1')).toBe('catalog')
    expect(navSection('/ru/search')).toBe('search')
    expect(navSection('/kk/dashboard')).toBe('dashboard')
    expect(navSection('/ru')).toBeNull()
    expect(navSection('/ru/unknown')).toBeNull()
    expect(navSection('/ru/catalogue')).toBeNull()
  })
})
