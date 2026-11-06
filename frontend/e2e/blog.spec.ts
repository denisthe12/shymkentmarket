import { expect, test } from '@playwright/test'

// Блог: статьи лежат в репозитории, от API не зависят
const link = (attrs: string, path: string) => new RegExp(`<link rel="${attrs}"[^>]* href="https?://[^"/]+${path}"`)

function jsonLd(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
}

test.describe('blog', () => {
  test('is linked from the footer, not from the header', async ({ page }) => {
    await page.goto('/ru/catalog')
    await expect(page.locator('header').getByRole('link', { name: 'Блог' })).toHaveCount(0)
    await page.getByTestId('footer-blog').click()
    await expect(page).toHaveURL(/\/ru\/blog$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Блог' })).toBeVisible()
  })

  test('lists posts of both languages and opens a Kazakh post from the Russian blog', async ({ page }) => {
    await page.goto('/ru/blog')
    await page.locator('main article').getByRole('link', { name: /ет пен құс етінің бағасы/ }).click()
    await expect(page).toHaveURL(/\/kk\/blog\/et-pen-qus-eti-bagalary$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'kk')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ет пен құс етінің бағасы')
  })

  test('paginates the feed: 10 posts per page, page 1 has its own URL', async ({ page, request }) => {
    await page.goto('/ru/blog')
    await expect(page.locator('main article')).toHaveCount(10)
    await page.getByRole('navigation', { name: 'Страницы блога' }).getByRole('link', { name: '2', exact: true }).click()
    await expect(page).toHaveURL(/\/ru\/blog\/page\/2$/)
    await expect(page.locator('main article')).toHaveCount(10)
    await expect(page.getByRole('navigation', { name: 'Страницы блога' }).locator('[aria-current="page"]')).toHaveText('2')
    expect((await request.get('/ru/blog/page/99')).status()).toBe(404)
    const first = await request.get('/ru/blog/page/1', { maxRedirects: 0 })
    expect(first.status()).toBe(308)
  })

  test('post page: table of contents anchors, chart with data table, author', async ({ page, isMobile }) => {
    await page.goto('/ru/blog/inflyaciya-kazahstan-2026')
    if (isMobile) await page.getByText('Содержание').first().click()
    const toc = page.getByRole('navigation', { name: 'Содержание' }).filter({ visible: true })
    await toc.getByRole('link', { name: 'Что дальше' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Что дальше' })).toBeInViewport()
    await expect(page.getByRole('group', { name: 'Годовая инфляция в 2026 году, %' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Айгерим Сейткали' }).first()).toHaveAttribute('href', '/ru/blog/authors/aigerim-seitkali')
  })

  test('post SEO: canonical without hreflang, article Open Graph, BlogPosting', async ({ request }) => {
    const html = await (await request.get('/kk/blog/zhumyrtqa-bagasy')).text()
    expect(html).toMatch(link('canonical', '/kk/blog/zhumyrtqa-bagasy'))
    expect(html).not.toMatch(/<link rel="alternate"[^>]*hrefLang/)
    expect(html).toContain('<meta property="og:type" content="article"/>')
    expect(html).toMatch(/<meta property="og:image" content="[^"]+\/blog\/og\/kk\/zhumyrtqa-bagasy\.png"\/>/)
    const [posting, breadcrumbs] = jsonLd(html)
    expect(posting).toMatchObject({ '@type': 'BlogPosting', inLanguage: 'kk', author: { '@type': 'Person' } })
    expect(posting.author).not.toHaveProperty('sameAs')
    expect(breadcrumbs).toMatchObject({ '@type': 'BreadcrumbList' })
  })

  test('a post does not exist in the other language, and the language switch leads to that blog', async ({ page, request }) => {
    expect((await request.get('/ru/blog/zhumyrtqa-bagasy')).status()).toBe(404)
    await page.goto('/kk/blog/zhumyrtqa-bagasy')
    await expect(page.getByRole('link', { name: 'Рус', exact: true })).toHaveAttribute('href', '/ru/blog')
  })
})
