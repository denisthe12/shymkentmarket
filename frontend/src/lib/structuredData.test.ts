import { describe, expect, it } from 'vitest'
import type { ProductCardDto } from '../api/types'
import { AUTHORS, getAuthor, getPost } from '../content/blog'
import { authorPageJsonLd, blogPostingJsonLd, breadcrumbJsonLd, productJsonLd, serializeJsonLd, siteJsonLd } from './structuredData'

const product: ProductCardDto = {
  id: 'p1',
  name: 'Молоко 3,2% 1 л',
  brand: 'FoodMaster',
  category: { slug: 'milk', name: 'Молоко' },
  imageUrl: 'https://cdn.example/milk.jpg',
  attributes: {},
  minPrice: 570,
  offers: [
    { storeCode: 'MAGNUM', storeName: 'MAGNUM', price: 570, oldPrice: null },
    { storeCode: 'STORE_A', storeName: 'STORE_A', price: 650, oldPrice: 700, inStock: false },
  ],
  snapshotAt: '2026-09-24T06:00:00Z',
}

describe('blog structured data', () => {
  const post = getPost('ru', 'gde-deshevle-produkty-aktau')!
  const person = AUTHORS.find((a) => a.kind === 'person' && a.placeholder)!

  it('describes a post as BlogPosting with dates, publisher and the editorial team as author', () => {
    const data = blogPostingJsonLd(post, getAuthor('editorial'), '/blog/og/ru/x.png')
    expect(data).toMatchObject({
      '@type': 'BlogPosting',
      url: 'http://localhost:3000/ru/blog/gde-deshevle-produkty-aktau',
      headline: post.title,
      inLanguage: 'ru',
      datePublished: post.published,
      dateModified: post.updated,
      image: ['http://localhost:3000/blog/og/ru/x.png'],
      author: { '@type': 'Organization', url: 'http://localhost:3000/ru/blog/authors/editorial' },
      publisher: { '@type': 'Organization', '@id': 'http://localhost:3000/#organization' },
    })
  })

  it('does not link placeholder authors to their stub profiles', () => {
    expect(blogPostingJsonLd(post, person, '/x.png').author).not.toHaveProperty('sameAs')
    const real = { ...person, placeholder: false, links: { linkedin: 'https://linkedin.com/in/real' } }
    expect(authorPageJsonLd('kk', real).mainEntity).toMatchObject({ '@type': 'Person', sameAs: ['https://linkedin.com/in/real'] })
  })
})

describe('structuredData', () => {
  it('describes a product with the price range across stores and an offer per store', () => {
    const data = productJsonLd('kk', product)
    expect(data).toMatchObject({
      '@type': 'Product',
      '@id': 'http://localhost:3000/kk/products/p1',
      url: 'http://localhost:3000/kk/products/p1',
      name: 'Молоко 3,2% 1 л',
      image: ['https://cdn.example/milk.jpg'],
      brand: { '@type': 'Brand', name: 'FoodMaster' },
      offers: { '@type': 'AggregateOffer', priceCurrency: 'KZT', lowPrice: 570, highPrice: 650, offerCount: 2 },
    })
    expect(data.offers.offers).toEqual([
      { '@type': 'Offer', price: 570, priceCurrency: 'KZT', seller: { '@type': 'Organization', name: 'MAGNUM' } },
      {
        '@type': 'Offer',
        price: 650,
        priceCurrency: 'KZT',
        seller: { '@type': 'Organization', name: 'STORE_A' },
        availability: 'https://schema.org/OutOfStock',
      },
    ])
  })

  it('omits image and brand when the product has none', () => {
    const data = productJsonLd('ru', { ...product, imageUrl: null, brand: null })
    expect(data).not.toHaveProperty('image')
    expect(data).not.toHaveProperty('brand')
  })

  it('numbers breadcrumbs and makes their URLs absolute in the page language', () => {
    expect(
      breadcrumbJsonLd('kk', [
        { name: 'Каталог', path: '/catalog' },
        { name: 'Молоко', path: '/collections/milk' },
      ]).itemListElement,
    ).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Каталог', item: 'http://localhost:3000/kk/catalog' },
      { '@type': 'ListItem', position: 2, name: 'Молоко', item: 'http://localhost:3000/kk/collections/milk' },
    ])
  })

  it('publishes the site name as WebSite by the Organization, on the catalog of the page language', () => {
    const data = siteJsonLd('kk', { description: 'Бағаларды салыстыру' })
    expect(data['@graph']).toEqual([
      {
        '@type': 'Organization',
        '@id': 'http://localhost:3000/#organization',
        name: 'Aktau Market',
        url: 'http://localhost:3000/',
        logo: 'http://localhost:3000/icon.svg',
      },
      {
        '@type': 'WebSite',
        '@id': 'http://localhost:3000/kk#website',
        name: 'Aktau Market',
        description: 'Бағаларды салыстыру',
        url: 'http://localhost:3000/kk/catalog',
        inLanguage: 'kk',
        publisher: { '@id': 'http://localhost:3000/#organization' },
      },
    ])
  })

  it('escapes < so a product name cannot close the script tag', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(json).not.toContain('<')
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
