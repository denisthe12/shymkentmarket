import { expect, test } from '@playwright/test'

test('catalog → SZPT tile → group → pack size → unit-price sort', async ({ page }) => {
  await page.goto('/ru/catalog')
  await page.getByTestId('szpt-tile').click()
  await expect(page).toHaveURL(/\/ru\/szpt\/rice$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Социально значимые продукты')
  await expect(page.getByTestId('product-card')).toHaveCount(3)

  await page.getByTestId('szpt-size-1000').click()
  await expect(page).toHaveURL(/size=1000/)
  await expect(page.getByTestId('product-card')).toHaveCount(1)
  await page.getByTestId('szpt-size-1000').click()

  await page.getByTestId('szpt-sort-unit_price_asc').click()
  await expect(page).toHaveURL(/sort=unit_price_asc/)
  const first = page.getByTestId('product-card').first()
  await expect(first).toContainText('Рис Тест 1 кг')
  await expect(first.getByTestId('unit-price')).toHaveText(/710\s₸\/кг/)
  // Цена упаковки остаётся главной цифрой, без ложных «0 ₸/кг»
  await expect(first.getByTestId('min-price')).toHaveText(/710\s₸/)
  await expect(page.getByText(/(^|\D)0\s₸\//)).toHaveCount(0)
})

test('SZPT group HTML comes from the server and the index redirects', async ({ request }) => {
  const html = await (await request.get('/kk/szpt/milk?sort=unit_price_asc')).text()
  expect(html).toContain('<html lang="kk"')
  expect(html).toContain('Сүт — Әлеуметтік маңызы бар азық-түлік — Aktau Market')
  expect(html.match(/data-testid="unit-price"/g)).toHaveLength(2)
  expect(html).not.toContain('data-testid="loading-state"')
  const index = await request.get('/ru/szpt', { maxRedirects: 0 })
  expect(index.status()).toBe(307)
  expect(index.headers().location).toBe('/ru/szpt/rice')
})
