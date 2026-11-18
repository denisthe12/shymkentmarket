import { describe, expect, it } from 'vitest'
import { getPosts, isIndexable, PRICES_ARE_PLACEHOLDER } from '../../../../../content/blog'
import { generateMetadata } from './page'

const metadataFor = (lang: string, slug: string) =>
  generateMetadata({ params: Promise.resolve({ lang, slug }) } as Parameters<typeof generateMetadata>[0])

describe('blog post metadata', () => {
  it('lets search engines index posts that do not depend on chain prices', async () => {
    const post = getPosts().find((p) => !p.needsSnapshot)!
    const meta = await metadataFor(post.lang, post.slug)
    expect(meta.robots).toBeUndefined()
    expect(meta.alternates?.canonical).toBe(`/${post.lang}/blog/${post.slug}`)
  })

  it('closes posts with placeholder prices with noindex, follow', async () => {
    const post = getPosts().find((p) => p.needsSnapshot)!
    const meta = await metadataFor(post.lang, post.slug)
    if (PRICES_ARE_PLACEHOLDER) expect(meta.robots).toEqual({ index: false, follow: true })
    else expect(meta.robots).toBeUndefined()
    expect(isIndexable(post)).toBe(!PRICES_ARE_PLACEHOLDER)
  })
})
